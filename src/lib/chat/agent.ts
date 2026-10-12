import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { replyWithoutQuoteUrl } from "@/lib/speakable";
import { serverEnv } from "@/lib/server-env";
import {
  CHAT_SKILL_CATALOG,
  buildLeanFrontDeskSystemPrompt,
  loadChatSkills,
  type ChatSkillId,
} from "@/lib/chat/skills";
import {
  EMPTY_ORDER_DRAFT,
  mergeOrderDraft,
  type CartProposal,
  type OrderDraft,
} from "@/lib/chat/order-draft";
import { touchChatSession } from "@/lib/chat/metrics";
import { guestIsClosingAfterQuote } from "@/lib/chat/end-call";
import {
  executeChatTool,
  parseToolCall,
  toolCatalogForPrompt,
} from "@/lib/chat/tools";
import { upsertCustomerFromLead } from "@/lib/crm";
import { getSettings } from "@/lib/repo";
import type { ContactChannel } from "@/lib/types";
import {
  getOrCreateGuestMemory,
  updateGuestMemoryOps,
} from "@/lib/planning/guest-memory-store";
import {
  summarizeGuestMemory,
  type GuestEventMemory,
  type MemoryOp,
} from "@/lib/planning/guest-memory";
import { getChefSpecialties } from "@/lib/planning/chef-specialties";
import { getDb } from "@/lib/store/local-db";
import { emptyMenuWishes, type MenuWishes } from "@/lib/planning/menu-wishes";
import { wishesFromMessages } from "@/lib/planning/wish-lexicon";
import {
  daysUntilIso,
  resolveRelativeEventDate,
  spokenDateLabel,
  todayLabel,
} from "@/lib/chat/relative-date";
import { draftPatchFromUtterance } from "@/lib/chat/utterance-facts";
import {
  addressCandidateForTurn,
  verifyAddress,
  type AddressVerifyResult,
} from "@/lib/geocode";
import { notifyManagersOfHumanRequest } from "@/lib/handoff";
import { voiceConfigured } from "@/lib/twilio-voice";
import {
  chefWithTitle,
  escapeRegExp,
  getYogiPeople,
  handoffTeamPhrase,
} from "@/lib/people";
import { upsertCateringBooking } from "@/lib/calendar-bookings";
import { fromCents, lineCents } from "@/lib/pricing";

const GEMINI_MODEL = "gemini-3.8-flash";

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentLead = {
  name: string;
  phone: string;
  email: string;
  event_date?: string;
  guest_count?: number | null;
  diet?: string;
  city?: string;
  notes?: string;
};

export type AgentOrderContext = {
  page?: string;
  diet?: string | null;
  guest_count?: number | null;
  event_date?: string;
  notes?: string;
  item_count?: number;
  subtotal?: number;
  items?: {
    name: string;
    quantity: number;
    unit?: string;
    price?: number;
    menu_item_id?: string;
    variant_id?: string;
  }[];
};

export type AgentTurnInput = {
  messages: AgentMessage[];
  lead: AgentLead;
  order_context?: AgentOrderContext;
  order_draft?: Partial<OrderDraft>;
  session_id?: string;
  channel?: ContactChannel;
  /** True when guest is on the voice Call path — keep spoken replies short. */
  voice_mode?: boolean;
  /**
   * Streams the answer's reply text as Gemini writes it (cumulative text per model call).
   * Post-processing can still append to the final reply, so callers must reconcile with it.
   */
  onReplyDelta?: (event: { round: number; text: string }) => void;
  /** Short progress note while a tool runs, e.g. "Choosing dishes…". */
  onStatus?: (text: string) => void;
};

const TOOL_STATUS: Record<string, string> = {
  build_plan: "Choosing dishes…",
  get_menu: "Checking the menu…",
  catering_math: "Working out quantities…",
  check_capacity: "Checking the calendar…",
  time_context: "Checking the date…",
  get_famous_combinations: "Looking up favorite combos…",
  followthrough: "Working on it…",
  order_draft: "Updating your order…",
};

/**
 * Pulls the "reply" string out of answer JSON while it is still streaming.
 * Only streams when "type":"answer" appears before "reply", so tool calls are never spoken.
 */
export function streamingReplyText(buffer: string): string | null {
  const typeAt = buffer.search(/"type"\s*:\s*"answer"/);
  const replyKey = /"reply"\s*:\s*"/.exec(buffer);
  if (typeAt < 0 || !replyKey || replyKey.index < typeAt) return null;
  let out = "";
  for (let i = replyKey.index + replyKey[0].length; i < buffer.length; i++) {
    const ch = buffer[i]!;
    if (ch === '"') return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = buffer[i + 1];
    if (next == null) return out;
    if (next === "u") {
      const hex = buffer.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += next === "n" ? "\n" : next === "t" ? " " : next;
    i += 1;
  }
  return out;
}

export type AgentMenuLine = {
  name: string;
  quantity: number;
  unit?: string;
  price?: number;
  line_total?: number;
};

export type AgentTurnResult = {
  reply: string;
  highlights: { label: string; value: string }[];
  bullets: string[];
  lines: AgentMenuLine[];
  lines_total: number | null;
  lines_title: string | null;
  offer_whatsapp: boolean;
  whatsapp_url: string | null;
  lead: AgentLead;
  order_draft: OrderDraft;
  cart_proposal: CartProposal | null;
  quote_id: string | null;
  quote_url: string | null;
  skills_used: string[];
  tools_used: string[];
  /** Geocoded guest address for on-screen confirmation */
  verified_address: AddressVerifyResult | null;
  /** Voice call: latest guest turn was unrelated to Yogiplate catering. */
  off_topic: boolean;
  /** Website guest asked for a person and browser calling is set up: offer to ring the store manager. */
  transfer_call: boolean;
  /**
   * Voice/web: conversation is finished (quote sent + guest closing, or model farewell).
   * Client should stop the mic and ignore further ambient speech until Talk is tapped again.
   */
  end_call: boolean;
};

function parseMenuLines(raw: unknown): AgentMenuLine[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentMenuLine[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name || row.item || "").trim();
    if (!name) continue;
    const quantity = Math.max(1, Number(row.quantity ?? row.qty ?? 1) || 1);
    const unit = row.unit != null ? String(row.unit).trim() : undefined;
    const price =
      row.price != null || row.unit_price != null
        ? Number(row.price ?? row.unit_price)
        : undefined;
    const line_total =
      row.line_total != null || row.total != null
        ? Number(row.line_total ?? row.total)
        : undefined;
    out.push({
      name,
      quantity,
      unit: unit || undefined,
      price: price != null && Number.isFinite(price) ? price : undefined,
      line_total:
        line_total != null && Number.isFinite(line_total)
          ? line_total
          : undefined,
    });
  }
  return out;
}

/**
 * Chat transfer to WhatsApp — disabled for now; set true to re-activate later.
 * (Owner E.164 env can stay configured; UI + agent offers stay off until this is true.)
 */
const WHATSAPP_CHAT_TRANSFER_ENABLED = false;

function whatsappConfigured() {
  if (!WHATSAPP_CHAT_TRANSFER_ENABLED) return false;
  const n =
    process.env.OWNER_WHATSAPP_E164 ||
    process.env.NEXT_PUBLIC_OWNER_WHATSAPP_E164 ||
    "";
  return /^\d{10,15}$/.test(n.replace(/\D/g, ""));
}

function ownerWhatsAppE164() {
  const raw =
    process.env.OWNER_WHATSAPP_E164 ||
    process.env.NEXT_PUBLIC_OWNER_WHATSAPP_E164 ||
    "";
  return raw.replace(/\D/g, "");
}

const CATERING_TURN =
  /\b(yogi|cater|menu|food|dish|item|tray|guest|people|event|wedding|birthday|party|baby|shower|naming|jain|vegan|vegetarian|deliver|pickup|quote|order|paneer|pizza|lunch|dinner|brunch|diet|allerg|address|chef|deposit|buffet|thali|roti|rice|dessert|spice|onion|garlic|mushroom|book|corporate|invoice|pay|kids?|adults?|date|time|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mild)\b/i;

const SOCIAL_TURN =
  /^(hi|hello|hey|namaste|thanks|thank you|ok|okay|yes|yeah|yep|no|nope|sure|correct|right|please|goodbye|bye|good morning|good evening|good afternoon|how are you|i am good|i'm good|im good|not now|maybe later)[.!?, ]*$/i;

const CALL_CHECK_TURN =
  /\b(hear me|are you there|can you repeat|say that again|pardon|one moment|hold on|just a (?:second|minute)|excuse me|what did you say|come again|you there)\b/i;

/** Voice only. True when this turn is clearly not about catering. */
function voiceTurnIsOffTopic(text: string, modelFlag: boolean): boolean {
  const t = text.trim();
  if (!t) return false;
  if (SOCIAL_TURN.test(t)) return false;
  if (CALL_CHECK_TURN.test(t)) return false;
  if (CATERING_TURN.test(t)) return false;
  if (/@|\d{3,}/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (
    words.length <= 4 &&
    /\b(today|tomorrow|tonight|next week|this weekend)\b/i.test(t)
  ) {
    return false;
  }
  if (words.length >= 3) return true;
  return modelFlag;
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) return fenced[1].trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return t.trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(text);
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/** Recover reply/lines from truncated JSON (common when max tokens cuts mid-array). */
function extractPartialAnswer(text: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(text);
  if (!trimmed.includes("{")) return null;

  const replyMatch = trimmed.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const reply = replyMatch
    ? replyMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim()
    : "";

  const lines: AgentMenuLine[] = [];
  const linesBlock = trimmed.match(/"lines"\s*:\s*\[([\s\S]*)/);
  if (linesBlock) {
    const objRe =
      /\{\s*"name"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"quantity"\s*:\s*(\d+)\s*(?:,\s*"unit"\s*:\s*"((?:\\.|[^"\\])*)")?(?:,\s*"price"\s*:\s*([\d.]+))?(?:,\s*"line_total"\s*:\s*([\d.]+))?/g;
    let m: RegExpExecArray | null;
    while ((m = objRe.exec(linesBlock[1])) && lines.length < 12) {
      const name = m[1].replace(/\\"/g, '"').trim();
      if (!name) continue;
      const quantity = Math.max(1, Number(m[2]) || 1);
      const unit = m[3] ? m[3].replace(/\\"/g, '"') : undefined;
      const price = m[4] != null ? Number(m[4]) : undefined;
      const line_total = m[5] != null ? Number(m[5]) : undefined;
      lines.push({
        name,
        quantity,
        unit,
        price: price != null && Number.isFinite(price) ? price : undefined,
        line_total:
          line_total != null && Number.isFinite(line_total)
            ? line_total
            : undefined,
      });
    }
  }

  const titleMatch = trimmed.match(/"lines_title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const totalMatch = trimmed.match(/"lines_total"\s*:\s*([\d.]+)/);

  if (!reply && !lines.length) return null;
  return {
    type: "answer",
    reply:
      reply ||
      "Here is a menu suggestion based on what we discussed — tell me if you want to adjust trays or add rice/dessert.",
    lines,
    lines_title: titleMatch ? titleMatch[1].replace(/\\"/g, '"') : undefined,
    lines_total: totalMatch ? Number(totalMatch[1]) : undefined,
    offer_whatsapp: false,
    lead: {},
  };
}

function parseModelResponse(text: string): Record<string, unknown> {
  const parsed = extractJsonObject(text);
  if (parsed) {
    if (typeof parsed.reply === "string" && parsed.reply.trim()) return parsed;
    for (const key of ["message", "answer", "text", "content"]) {
      if (typeof parsed[key] === "string" && String(parsed[key]).trim()) {
        return {
          type: "answer",
          reply: String(parsed[key]).trim(),
          offer_whatsapp: Boolean(parsed.offer_whatsapp),
          lead: parsed.lead || {},
          lines: parsed.lines,
          lines_total: parsed.lines_total,
          lines_title: parsed.lines_title,
        };
      }
    }
    const type = String(parsed.type || parsed.action || "").toLowerCase();
    // tool_call / load_skill have no reply — must still return so the ReAct loop can run
    // Do NOT treat top-level "name" alone as a tool (lead.name confusion).
    if (
      type === "tool_call" ||
      type === "call_tool" ||
      type === "load_skill" ||
      type === "load_skills" ||
      parsed.skill_ids ||
      parsed.skillIds ||
      (parsed.tool &&
        (type === "tool_call" ||
          type === "call_tool" ||
          !parsed.type))
    ) {
      if (!parsed.type && parsed.tool) {
        return { ...parsed, type: "tool_call" };
      }
      return parsed;
    }
    // Truncated answer object with lines but missing reply string close
    const partialFromParsed = extractPartialAnswer(text);
    if (partialFromParsed) return partialFromParsed;
  }

  // Never treat non-JSON text as a reply: with JSON mode it is cut-off model reasoning.
  const plain = stripCodeFences(text).trim();
  const partial = extractPartialAnswer(text);
  if (partial) return partial;

  if (!plain) {
    throw new Error("empty_or_unparseable_response");
  }
  throw new Error(`empty_or_unparseable_response: ${plain.slice(0, 120)}`);
}

const FALLBACK_REPLY =
  "Namaste — I'm here to help with Yogiplate catering menus, diets, trays, and your event. What would you like to know?";

function isFallbackReply(parsed: Record<string, unknown>): boolean {
  return (
    String(parsed.reply || "").trim() === FALLBACK_REPLY ||
    String(parsed._parse_failed || "") === "1"
  );
}

type ModelPart = { text?: string; thought?: boolean };

/** Visible answer text only — thought parts are internal reasoning and must never reach the guest. */
function visibleText(parts: ModelPart[] | undefined): string {
  return (parts || [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function modelText(result: {
  response: {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: ModelPart[] };
    }>;
  };
}): string {
  const candidate = result.response.candidates?.[0];
  const text = visibleText(candidate?.content?.parts).trim();
  if (!text && candidate?.finishReason) {
    console.error("[chat] empty model text, finishReason=", candidate.finishReason);
  }
  return text;
}

const INTERNAL_TERMS = [
  /\b(build_plan|get_menu|update_guest_memory|get_guest_memory|order_draft|catering_math|catering_calendar|check_capacity|time_context|followthrough|get_chef_specialties|get_famous_combinations|load_skill|tool_call|skill_ids|GUEST_MEMORY)\b/i,
  /\b(model responses?|tool calls?|tool results?|function calls?|function responses?|system prompt|in the prompt|the prompt (says|shows|includes|contains))\b/i,
  /\bJSON\b|[`{}]/,
];

export const INTERNAL_REPLY_SUBSTITUTE = "Give me one moment while I pull up the menu.";

/** True when text reads like the agent's own reasoning or plumbing rather than a guest reply. */
export function looksInternal(text: string): boolean {
  return INTERNAL_TERMS.some((re) => re.test(text));
}

const FULL_GROUP_DIETS = ["jain", "vegan", "swaminarayan", "pushtimarg"] as const;

/**
 * build_plan reads guest memory, while earlier turns save event facts to the order draft.
 * Copy draft facts that memory is missing or has differently so the plan uses them.
 */
export function draftMemoryOps(
  draft: OrderDraft,
  memory: GuestEventMemory,
  heardWishes?: MenuWishes
): MemoryOp[] {
  const ops: MemoryOp[] = [];
  const event = memory.event as Record<string, unknown>;
  const fields: [keyof GuestEventMemory["event"], string][] = [
    ["occasion", String(draft.occasion || "")],
    ["date", draft.event_date],
    ["meal_time", draft.event_time],
    ["meal", draft.meal],
    ["delivery_or_pickup", draft.delivery_or_pickup],
    ["city", draft.city],
    ["address", draft.address],
  ];
  for (const [key, raw] of fields) {
    const value = String(raw || "").trim();
    if (value && String(event[key] || "") !== value) {
      ops.push({ op: "update", path: `event.${key}`, value });
    }
  }

  const total =
    draft.adults != null && draft.adults > 0 ? draft.adults + (draft.kids || 0) : null;
  if (total != null && memory.headcount.total !== total) {
    ops.push({ op: "update", path: "headcount", value: total });
  }

  const dietText = String(draft.diet || "").toLowerCase();
  const diet = FULL_GROUP_DIETS.find((d) => dietText.includes(d));
  const guests = total ?? memory.headcount.total;
  if (diet && guests) {
    const group = memory.requirement_groups.find((g) => g.kind === diet);
    if (!group || group.count !== guests) {
      ops.push({ op: "update", path: "requirement_groups", key: diet, value: guests });
    }
  }

  if (heardWishes) {
    const before = JSON.stringify(memory.menu_wishes_heard || emptyMenuWishes());
    if (JSON.stringify(heardWishes) !== before) {
      ops.push({ op: "update", path: "menu_wishes_heard", value: heardWishes });
    }
  }

  return ops;
}

const AFFIRMATIVE =
  /^\s*(yes|yeah|yep|yup|ya|sure|ok(ay)?|correct|right|perfect|great|confirm(ed)?|proceed|go ahead|sounds good|looks good|all good|that'?s (right|correct|good|it))\b/i;
const CONFIRM_QUESTION =
  /\b(look good|looks good|proceed|confirm|correct|sound good|shall i|ready to (see|choose|view))\b/i;

/** Guest just said yes to the event summary and no menu has been planned yet. */
export function confirmedDetailsForMenu(
  messages: { role: string; content: string }[],
  memory: GuestEventMemory | null
): boolean {
  const last = messages[messages.length - 1];
  const prev = messages[messages.length - 2];
  if (!last || last.role !== "user" || last.content.length > 80) return false;
  if (!AFFIRMATIVE.test(last.content)) return false;
  if (!prev || prev.role !== "assistant" || !CONFIRM_QUESTION.test(prev.content)) return false;
  if (!memory?.headcount.total) return false;
  return !memory.planned_menu?.length;
}

function mergeLead(prev: AgentLead, next: Partial<AgentLead>): AgentLead {
  const nextGuests =
    next.guest_count != null && Number(next.guest_count) > 0
      ? Number(next.guest_count)
      : null;
  return {
    name: next.name || prev.name,
    phone: next.phone || prev.phone,
    email: next.email || prev.email,
    event_date: next.event_date || prev.event_date || "",
    guest_count:
      next.guest_count === undefined
        ? prev.guest_count != null && prev.guest_count > 0
          ? prev.guest_count
          : null
        : nextGuests,
    diet: next.diet || prev.diet || "",
    city: next.city || prev.city || "",
    notes: next.notes || prev.notes || "",
  };
}

/** Drop Guests/Diet/Date chips unless we actually know those facts. */
function sanitizeHighlights(
  highlights: { label: string; value: string }[],
  known: { guests: number | null; diet: string; date: string }
): { label: string; value: string }[] {
  return highlights.filter((h) => {
    const label = h.label.toLowerCase();
    const value = h.value.toLowerCase();
    if (/guest|headcount|people|pax/.test(label)) {
      if (known.guests == null || known.guests <= 0) return false;
      // Block classic invented demo values when not confirmed
      if (/\b25\b/.test(value) && known.guests !== 25) return false;
      return true;
    }
    if (/diet|menu path|cuisine/.test(label)) {
      if (!known.diet) return false;
      if (/vegan/.test(value) && !/vegan/i.test(known.diet)) return false;
      return true;
    }
    if (/^date$|event date|when|day/.test(label)) {
      if (!known.date) return false;
      if (/sep(t)?\.?\s*26|2026-09-26/.test(value) && !/2026-09-26|sep(t)?\.?\s*26/i.test(known.date)) {
        return false;
      }
      return true;
    }
    return true;
  });
}

function slimOrderContext(ctx: AgentOrderContext | undefined) {
  if (!ctx) return null;
  const guest_count =
    ctx.guest_count != null && Number(ctx.guest_count) > 0
      ? Number(ctx.guest_count)
      : null;
  const event_date = String(ctx.event_date || "").trim();
  // Diet from menu browse alone is not an order fact — only when cart has items.
  const diet =
    (ctx.item_count || 0) > 0 && ctx.diet ? String(ctx.diet).trim() : "";
  return {
    page: ctx.page || "/",
    diet: diet || null,
    guest_count,
    event_date: event_date || "",
    notes: ctx.notes || "",
    item_count: ctx.item_count || 0,
    subtotal: ctx.subtotal || 0,
    items: ctx.items || [],
  };
}

function formatLoadedSkills(loaded: Record<string, string>): string {
  const ids = Object.keys(loaded);
  if (!ids.length) return "(none)";
  return ids.map((id) => `### SKILL \`${id}\`\n${loaded[id]}`).join("\n\n");
}

function prefetchSkillIds(userText: string): ChatSkillId[] {
  const t = userText.toLowerCase();
  const ids = new Set<ChatSkillId>(["business", "ordering", "diets"]);

  if (/whatsapp|text me|call me|human|owner|speak to/.test(t)) {
    ids.add("whatsapp");
  }
  if (
    /menu|dish|food|tray|price|cost|\$|order|cater|people|guest|dinner|lunch|sufficient|enough|serves?|quote|deposit/.test(
      t
    )
  ) {
    ids.add("menu-index");
    ids.add("menu-recommend");
  }
  if (/appetizer|samosa|pakora|chaat|poori|pani/.test(t)) {
    ids.add("menu-appetizers");
  }
  if (/salad/.test(t)) ids.add("menu-salads");
  if (/paneer|curry|sabzi|vegetable|gobi|bhindi|kofta|makhni/.test(t)) {
    ids.add("menu-vegetable-dishes");
  }
  if (/dal|soup|rasam|sambar/.test(t)) ids.add("menu-dal-soups");
  if (/rice|biryani|pulao|noodle|khichri/.test(t)) {
    ids.add("menu-rice-noodles");
  }
  if (/roti|naan|bread|poori|paratha|bhatura|pav/.test(t)) {
    ids.add("menu-breads-rotis");
  }
  if (/dessert|sweet|gulab|rasmalai|halwa|kheer/.test(t)) {
    ids.add("menu-desserts");
  }
  if (/chutney|raita|pickle|condiment/.test(t)) ids.add("menu-condiments");
  if (/pasta|lasagna|risotto|orzo/.test(t)) ids.add("menu-pastas");
  if (/pizza|margherita/.test(t)) ids.add("menu-pizzas");
  if (/package|thali|combo/.test(t)) ids.add("menu-recommend");
  if (/side|focaccia/.test(t)) ids.add("menu-sides");
  if (/drink|beverage|lassi|chaas|buttermilk|tea\b/.test(t)) ids.add("menu-drinks");

  return [...ids].slice(0, 8);
}

export function agentErrorCode(detail: string): string {
  if (/API_KEY|api key|403|401|PERMISSION|invalid.*key/i.test(detail)) {
    return "gemini_auth";
  }
  if (/404|not found|is not found/i.test(detail)) return "gemini_model";
  if (/timeout|timed out|Deadline|ETIMEDOUT/i.test(detail)) {
    return "timeout";
  }
  if (/unparseable|empty_or_unparseable|JSON/i.test(detail)) {
    return "bad_response";
  }
  return "gemini_error";
}

/** Shared front-desk turn for web chat and omnichannel adapters. */
export async function runFrontDeskTurn(
  input: AgentTurnInput
): Promise<AgentTurnResult> {
  const apiKey = serverEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("missing_GEMINI_API_KEY");
  }

  const last = input.messages[input.messages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("last_message_must_be_user");
  }

  const channel = input.channel || "web_chat";
  const people = getYogiPeople();
  const chefToken = escapeRegExp(people.chefName);
  const managerToken = escapeRegExp(people.managerName);
  const userAskedHuman = new RegExp(
    `\\b(talk to (a |the )?(human|person|owner|chef|someone|manager)|speak (to|with) (a |the )?(human|person|owner|chef|someone|manager)|call (me|us|you|the owner|${chefToken}|${managerToken})|connect me|real person|live (agent|person|chat)|escalate|restaurant manager|human please|want a person|${chefToken}|${managerToken})\\b`,
    "i"
  ).test(last.content);
  const sessionId =
    input.session_id ||
    `sess_${input.lead.email.toLowerCase().replace(/[^a-z0-9]/g, "")}_${channel}`;

  await upsertCustomerFromLead({
    name: input.lead.name,
    email: input.lead.email,
    phone: input.lead.phone,
    city: input.lead.city,
    channel,
  }).catch(() => null);

  const waReady = whatsappConfigured();
  const settings = await getSettings().catch(() => null);
  const voiceMode = Boolean(input.voice_mode);
  const system = [
    buildLeanFrontDeskSystemPrompt(waReady),
    "",
    toolCatalogForPrompt(),
    channel !== "web_chat"
      ? `\nCHANNEL: This turn arrived via ${channel}. Keep replies concise for that medium.`
      : "",
    voiceMode
      ? "\nVOICE MODE: The guest is talking to you with their microphone and hears your reply spoken aloud. reply is one or two short spoken sentences: a brief acknowledgment or one tip, then one question (after a human handoff you may use 2–3 short sentences: confirm transfer, they will contact shortly, offer to still help with order/quote). Name at most two dishes. Prefer empty lines[] unless they asked for the menu list. Keep JSON compact for speed. Never re-ask anything already in Order draft, GUEST_MEMORY, or [Resolved event_date]. The final recap may run a little longer, but keep it natural. Never say a URL, localhost address, or quote link out loud; say the quotation was emailed. Set off_topic true only when the guest's latest message is completely unrelated to Yogiplate catering. Greetings, yes or no, names, dates, counts, and anything about food or the event are not off topic. When off_topic is true, answer with one short sentence inviting them back to the catering conversation. ENDING THE CALL: After the quote has been emailed/texted, if the guest says thanks, bye, okay, sure, hmm, or anything that is not a new catering request, set end_call true, give one short warm goodbye with no question, and do not keep the conversation open. Never keep chatting with background noise or other languages after the goodbye."
      : "",
  ].join("\n");

  const history = input.messages.slice(0, -1).map((m) => ({
    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }],
  }));
  while (history.length && history[0].role !== "user") {
    history.shift();
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: system,
    generationConfig: {
      temperature: 0.3,
      // Thinking tokens count against this budget on Gemini 3; a low cap truncates the JSON.
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "low" },
    } as GenerationConfig,
  });

  const slimCart = slimOrderContext(input.order_context);
  const ctxGuests = slimCart?.guest_count ?? null;
  const leadGuests =
    input.lead.guest_count != null && Number(input.lead.guest_count) > 0
      ? Number(input.lead.guest_count)
      : null;
  const ctxDiet = String(slimCart?.diet || "").trim();
  const ctxDate = String(slimCart?.event_date || "").trim();
  const draftAdults =
    input.order_draft?.adults != null && Number(input.order_draft.adults) > 0
      ? Number(input.order_draft.adults)
      : null;

  let orderDraft: OrderDraft = mergeOrderDraft(EMPTY_ORDER_DRAFT, {
    ...(input.order_draft || {}),
    event_date:
      input.order_draft?.event_date ||
      input.lead.event_date ||
      ctxDate ||
      "",
    adults: draftAdults ?? leadGuests ?? ctxGuests ?? null,
    diet: input.order_draft?.diet || input.lead.diet || ctxDiet || "",
    city: input.order_draft?.city || input.lead.city || "",
    notes: input.order_draft?.notes || input.lead.notes || "",
  } as Partial<OrderDraft>);
  const proposalState: { current: CartProposal | null } = { current: null };
  let lastQuoteId: string | null = null;
  let quoteUrl: string | null = null;
  let lastHoldId: string | null = null;
  let humanHandoffSent = false;

  let guestMemory = await getOrCreateGuestMemory({
    session_id: sessionId,
    customer_email: input.lead.email || "unknown@guest.local",
  }).catch(() => null);

  // Persist relative spoken dates (e.g. "next Thursday") into draft + memory
  // so voice mode cannot "forget" and re-ask on the next turn.
  const savedDaysOut = daysUntilIso(String(orderDraft.event_date || "").trim());
  if (savedDaysOut != null && savedDaysOut < 0) {
    orderDraft = { ...orderDraft, event_date: "" };
  }
  const resolvedDate = resolveRelativeEventDate(last.content);
  let resolvedDateHint = `\n\n[TODAY: ${todayLabel()}]`;
  if (resolvedDate?.options && !String(orderDraft.event_date || "").trim()) {
    const [a, b] = resolvedDate.options;
    resolvedDateHint += `\n\n[DATE_OPTIONS: The guest said "${resolvedDate.phrase}", which could mean ${a} (${spokenDateLabel(a)}) or ${b} (${spokenDateLabel(b)}). Do not save a date yet. Ask once: "Just to check: ${spokenDateLabel(a)}, or ${spokenDateLabel(b)}?" Save the one they pick with order_draft event_date.]`;
  } else if (resolvedDate && !String(orderDraft.event_date || "").trim()) {
    orderDraft = mergeOrderDraft(orderDraft, {
      event_date: resolvedDate.iso,
    });
    resolvedDateHint += `\n\n[Resolved event_date: ${resolvedDate.iso} (${resolvedDate.phrase}). Treat this as known — do not re-ask for the date.]`;
    try {
      const memResult = await updateGuestMemoryOps({
        session_id: sessionId,
        customer_email: input.lead.email || "unknown@guest.local",
        ops: [
          {
            op: "update",
            path: "event.date",
            value: resolvedDate.iso,
          },
        ],
      });
      guestMemory = memResult.memory;
    } catch {
      /* keep draft even if memory write fails */
    }
  } else if (
    resolvedDate &&
    String(orderDraft.event_date || "").trim() === resolvedDate.iso
  ) {
    resolvedDateHint += `\n\n[Resolved event_date: ${resolvedDate.iso} (${resolvedDate.phrase}). Already on file — do not re-ask.]`;
  }

  // Voice turns often answer without calling tools — persist occasion, guests,
  // time, and diet (incl. STT “Jane”→Jain and pizza→Italian) from the utterance.
  const utterancePatch = draftPatchFromUtterance(orderDraft, last.content);
  if (Object.keys(utterancePatch).length) {
    orderDraft = mergeOrderDraft(orderDraft, utterancePatch);
    const factBits = [
      utterancePatch.occasion ? `occasion=${utterancePatch.occasion}` : "",
      utterancePatch.adults != null ? `guests=${utterancePatch.adults}` : "",
      utterancePatch.event_time ? `time=${utterancePatch.event_time}` : "",
      utterancePatch.diet ? `diet=${utterancePatch.diet}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    if (factBits) {
      resolvedDateHint += `\n\n[Heard this turn and saved to the order draft: ${factBits}. Do not re-ask for these. Continue to the next missing slot, or call build_plan when you have enough for a menu.]`;
    }
    try {
      const memOps: MemoryOp[] = [];
      if (utterancePatch.occasion) {
        memOps.push({
          op: "update",
          path: "event.occasion",
          value: utterancePatch.occasion,
        });
      }
      if (utterancePatch.event_time) {
        memOps.push({
          op: "update",
          path: "event.meal_time",
          value: utterancePatch.event_time,
        });
      }
      if (utterancePatch.adults != null) {
        memOps.push({
          op: "update",
          path: "headcount",
          value: utterancePatch.adults,
        });
      }
      if (utterancePatch.diet === "jain" || utterancePatch.diet === "vegan") {
        const dietGuests = utterancePatch.adults ?? orderDraft.adults ?? 0;
        if (dietGuests > 0) {
          memOps.push({
            op: "update",
            path: "requirement_groups",
            key: utterancePatch.diet,
            value: dietGuests,
          });
        }
      }
      if (memOps.length) {
        const memResult = await updateGuestMemoryOps({
          session_id: sessionId,
          customer_email: input.lead.email || "unknown@guest.local",
          ops: memOps,
        });
        guestMemory = memResult.memory;
      }
    } catch {
      /* draft still holds the facts */
    }
  }

  let verified_address: AddressVerifyResult | null = null;
  let addressHint = "";
  const spokenAddress = addressCandidateForTurn({ userText: last.content });
  if (spokenAddress) {
    verified_address = await verifyAddress(
      spokenAddress,
      orderDraft.city || input.lead.city || undefined
    ).catch(() => ({
      ok: false as const,
      query: spokenAddress,
      error: "Could not verify that address right now.",
    }));
    if (verified_address.ok) {
      orderDraft = mergeOrderDraft(orderDraft, {
        delivery_or_pickup: orderDraft.delivery_or_pickup || "delivery",
        address: verified_address.formatted,
      });
      addressHint = `\n\n[VERIFIED_ADDRESS: ${verified_address.formatted} (already saved to the order draft). Read it back naturally as house number and street, city, state, and ZIP (skip county and country), and ask the guest to confirm it. Do not ask for the ZIP or city.]`;
    } else {
      addressHint = `\n\n[ADDRESS_NOT_VERIFIED: "${spokenAddress}" could not be found on the map. Kindly ask the guest to repeat the house number and street, with the city.]`;
    }
  }

  const daysOut = daysUntilIso(String(orderDraft.event_date || "").trim());
  if (daysOut != null && daysOut >= 0 && daysOut <= 1) {
    resolvedDateHint += `\n\n[SHORT_NOTICE: The event (${orderDraft.event_date}, ${spokenDateLabel(orderDraft.event_date)}) is less than 48 hours away. If you have not said so yet in this chat, mention once, politely, that short-notice orders need the kitchen's confirmation, then keep helping.]`;
  }

  if (guestMemory) {
    let heard: MenuWishes | undefined;
    try {
      heard = wishesFromMessages(input.messages, (await getDb()).menu_items || []);
    } catch {
      heard = undefined;
    }
    const ops = draftMemoryOps(orderDraft, guestMemory, heard);
    if (ops.length) {
      try {
        const memResult = await updateGuestMemoryOps({
          session_id: sessionId,
          customer_email: input.lead.email || "unknown@guest.local",
          ops,
        });
        guestMemory = memResult.memory;
      } catch {
        /* build_plan still works from whatever memory has */
      }
    }
  }

  const memorySummary = guestMemory
    ? summarizeGuestMemory(guestMemory)
    : "(none)";

  let engineLines: AgentMenuLine[] | null = null;
  let engineLinesTitle: string | null = null;
  let engineLinesTotal: number | null = null;

  const liveCartItems =
    slimCart?.items
      ?.filter((i) => i.menu_item_id)
      .map((i) => ({
        menu_item_id: String(i.menu_item_id),
        variant_id: i.variant_id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
      })) || [];

  const leadForModel: AgentLead = {
    ...input.lead,
    guest_count: leadGuests,
    diet: input.lead.diet || ctxDiet || "",
    event_date:
      orderDraft.event_date ||
      input.lead.event_date ||
      ctxDate ||
      "",
  };
  const leadHint = `\n\n[Known lead: ${JSON.stringify(leadForModel)}]`;
  const orderHint = slimCart
    ? `\n\n[Cart:\n${JSON.stringify(slimCart)}]\n(Only use diet/guests/date from Cart if non-empty. Never invent 25 guests, Vegan, or a date.)`
    : "";
  const draftHint = `\n\n[Order draft:\n${JSON.stringify(orderDraft)}]`;
  const memoryHint = `\n\n[GUEST_MEMORY: ${memorySummary}]\n(Do not invent headcount/diet/date missing from GUEST_MEMORY. Do not re-ask facts already listed.)`;

  const confirmedForMenu = confirmedDetailsForMenu(input.messages, guestMemory);
  const prefetch = prefetchSkillIds(last.content);
  if (confirmedForMenu) prefetch.push("menu-index", "menu-recommend");
  const { loaded: preloaded } = loadChatSkills(prefetch);
  const loaded: Record<string, string> = {};
  const skillsUsed: string[] = [];
  const toolsUsed: string[] = [];
  for (const item of preloaded) {
    loaded[item.id] = item.content;
    skillsUsed.push(item.id);
  }

  const chat = model.startChat({ history });
  const streamReply = input.onReplyDelta && !userAskedHuman ? input.onReplyDelta : null;
  let modelRound = 0;

  async function sendModel(message: string) {
    if (!streamReply) return chat.sendMessage(message);
    const round = ++modelRound;
    const streamed = await chat.sendMessageStream(message);
    let buffer = "";
    let sent = "";
    let blocked = false;
    for await (const chunk of streamed.stream) {
      buffer += visibleText(chunk.candidates?.[0]?.content?.parts as ModelPart[] | undefined);
      const text = streamingReplyText(buffer);
      if (blocked || !text) continue;
      if (looksInternal(text)) {
        blocked = true;
        continue;
      }
      if (text.length > sent.length) {
        sent = text;
        streamReply({ round, text });
      }
    }
    return { response: await streamed.response };
  }

  const asksOnionGarlic =
    /onion|garlic|mushroom|pyaaz|lahsun|ingredients?/.test(
      last.content.toLowerCase()
    );
  const asksSpecialty =
    /specialt|signature|famous (for|dish)|what are you known|chef.?s (best|special)|house special|stone craft/.test(
      last.content.toLowerCase()
    );

  // Preload specialties so "what is your specialty?" answers in one shot (avoids Netlify timeouts).
  let specialtyHint = "";
  if (asksSpecialty) {
    try {
      const db = await getDb();
      const rows = getChefSpecialties().map((s) => {
        const item = db.menu_items.find((m) => m.id === s.menu_item_id);
        const price = item?.price;
        return {
          name: item?.name || s.label,
          why: s.why,
          price: price != null ? price : null,
          unit: item?.unit || "tray",
        };
      });
      specialtyHint = [
        "CHEF_SPECIALTIES (already loaded — answer NOW with type:answer; do not call tools for this):",
        JSON.stringify(rows.slice(0, 8)),
        `REQUIRED THIS TURN: Guest asked about specialty/signature. Warm reply about ${chefWithTitle()} and wholesome vegetarian cooking, pure and full of flavor, plus Stone Craft pizzas. Put up to 5 items in lines[] using these names/prices (quantity 1). Never invent other dishes. Never say sattvik. Never say Prabhu.`,
      ].join("\n");
    } catch {
      specialtyHint =
        "REQUIRED THIS TURN: Guest asked about specialty. Answer from business skill — Palak Paneer, Alu Gobi, Okra, Smoky Paneer Makhni, Stone Craft pizzas. Prefer type:answer with no tools.";
    }
  }

  const turn = [
    last.content,
    resolvedDateHint,
    addressHint,
    leadHint,
    orderHint,
    draftHint,
    memoryHint,
    "",
    "Relevant kitchen knowledge (already loaded):",
    formatLoadedSkills(loaded),
    specialtyHint,
    "",
    "Earlier turns in this chat show only what you said to the guest; tool calls and results from earlier turns are not shown. Order draft and GUEST_MEMORY above are the current saved facts, and build_plan reads GUEST_MEMORY directly. Do not try to reconstruct earlier tool calls.",
    confirmedForMenu
      ? 'REQUIRED THIS TURN: The guest just confirmed their event details. The facts are already saved, and menu-recommend is loaded. Call {"type":"tool_call","tool":"build_plan","args":{"replace":true}} now, with no other tool first, then present the menu from its lines.'
      : "",
    "Return ONLY JSON: tool_call, load_skill, or answer (with reply + optional lines/highlights/bullets).",
    'In answer JSON always write "type":"answer" first and "reply" second, before lines or any other field.',
    "For simple greetings (hi/hello), return answer JSON with a short warm reply — no tools needed.",
    asksOnionGarlic
      ? "REQUIRED THIS TURN: Guest asked about onion/garlic/mushrooms/ingredients. Answer that fact clearly and warmly in reply — do not evade or only talk about menus. Our kitchen does not use onion, garlic, or mushrooms."
      : "",
    asksSpecialty
      ? "Do not call get_chef_specialties this turn — specialties are already in CHEF_SPECIALTIES above."
      : "",
    "Extract new guest facts with update_guest_memory. For menu plans use build_plan and copy its lines, prices, and reason. Load menu-recommend before you recommend. Never say we’ll plan.",
    "When proposing dishes: put every build_plan line in lines[] (up to 12) and use each line’s reason. If the guest asked for a number of dishes, call build_plan with dish_count and do not drop any. One short sentence before the list with one reason. On a voice call, one or two sentences and at most two dish names. Never Markdown ** in reply. Keep JSON compact so it is not truncated.",
    "Prefer one tool then answer. Use get_menu / build_plan for planning; catering_math for packages; order_draft for cart; followthrough for quote/deposit.",
    "Use time_context + check_capacity for dates.",
    `Skill ids: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  function safeParse(raw: string): Record<string, unknown> {
    try {
      const parsed = parseModelResponse(raw);
      const kind = String(parsed.type || "answer").toLowerCase();
      if (kind === "answer" && typeof parsed.reply === "string" && looksInternal(parsed.reply)) {
        console.error("[chat] internal text in reply, retrying:", parsed.reply.slice(0, 280));
        return {
          type: "answer",
          reply: FALLBACK_REPLY,
          offer_whatsapp: false,
          lead: {},
          _parse_failed: "1",
        };
      }
      return parsed;
    } catch (err) {
      console.error("[chat] parse failed", err, "raw=", raw.slice(0, 280));
      return {
        type: "answer",
        reply: FALLBACK_REPLY,
        offer_whatsapp: false,
        lead: {},
        _parse_failed: "1",
      };
    }
  }

  function contextualFallback(): Record<string, unknown> {
    const cartBits = input.order_context?.items?.length
      ? input.order_context.items
          .slice(0, 4)
          .map((i) => `${i.quantity}× ${i.name}`)
          .join(", ")
      : "";
    const guests =
      orderDraft.adults ??
      input.lead.guest_count ??
      input.order_context?.guest_count;
    const diet =
      orderDraft.diet || input.lead.diet || input.order_context?.diet || "";
    const occasion = String(orderDraft.occasion || "").trim();
    const date = String(orderDraft.event_date || "").trim();
    const missing =
      (!occasion && "occasion") ||
      (!guests && "guest count") ||
      (!date && "event date") ||
      (!diet && "dietary preference") ||
      "";
    const reply =
      guests && diet && date
        ? `I have ${guests} guests${occasion ? ` for a ${occasion.replace(/_/g, " ")}` : ""}${
            diet ? ` on a ${diet.replace(/_/g, " ")} menu` : ""
          }${date ? ` for ${spokenDateLabel(date)}` : ""}. Shall I propose a pizza and catering menu with prices next?`
        : guests || diet || cartBits || occasion || date
          ? `Thanks — I have${occasion ? ` a ${occasion.replace(/_/g, " ")}` : ""}${
              guests ? ` for about ${guests} guests` : ""
            }${diet ? `, ${diet.replace(/_/g, " ")}` : ""}${
              date ? `, ${spokenDateLabel(date)}` : ""
            }${cartBits ? ` (${cartBits})` : ""}. ${
              missing ? `What’s the ${missing}?` : "Shall I propose a menu with prices?"
            }`
          : "I can suggest a clear tray-by-tray menu for your event. What’s the occasion, and about how many guests?";
    return {
      type: "answer",
      reply,
      offer_whatsapp: false,
      lead: {},
      bullets: missing
        ? [`Share ${missing}`]
        : ["Ask me to propose a menu with prices"],
    };
  }

  let result = await sendModel(turn);
  let parsed = safeParse(modelText(result));
  let lastToolSummary = "";

  let didCompactRetry = false;

  for (let round = 0; round < 4; round++) {
    // Empty / failed parse — one compact retry, then contextual fallback
    if (
      !didCompactRetry &&
      (isFallbackReply(parsed) ||
        !String(parsed.reply || parsed.type || parsed.tool || "").trim())
    ) {
      didCompactRetry = true;
      result = await sendModel(
        [
          "Your previous JSON was empty or truncated. Return ONE compact answer JSON now.",
          "Fields: type:answer, reply (2 short sentences), lines (every planned dish, up to 12, with name,quantity,unit,price), lines_total, highlights (optional).",
          "No tool_call. No Markdown. Use the cart and skills already in context.",
          lastToolSummary
            ? `Last tool summary to cite: ${lastToolSummary.slice(0, 600)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      parsed = safeParse(modelText(result));
      if (isFallbackReply(parsed)) {
        parsed = contextualFallback();
        break;
      }
      // Successful recovery — process as answer/tool in this same round
    }

    const toolCall = parseToolCall(parsed);
    if (toolCall) {
      const status = TOOL_STATUS[toolCall.tool];
      if (status) input.onStatus?.(status);
      const toolResult = await executeChatTool(toolCall.tool, toolCall.args, {
        lead_name: input.lead.name,
        lead_phone: input.lead.phone,
        lead_email: input.lead.email,
        lead_time_hours: settings?.lead_time_hours,
        orderDraft,
        setOrderDraft: (d) => {
          orderDraft = d;
        },
        cartProposal: proposalState.current,
        setCartProposal: (p) => {
          proposalState.current = p;
        },
        channel,
        chat_session_id: sessionId,
        lastQuoteId,
        setLastQuoteId: (id) => {
          lastQuoteId = id;
        },
        messages: input.messages,
        quoteUrl,
        live_cart_items: liveCartItems,
      });
      toolsUsed.push(toolCall.tool);
      lastToolSummary =
        toolResult && typeof toolResult === "object" && "summary" in toolResult
          ? String((toolResult as { summary?: string }).summary || "")
          : JSON.stringify(toolResult).slice(0, 400);
      if (toolResult && typeof toolResult === "object") {
        if (toolCall.tool === "followthrough") {
          const ft = toolResult as {
            quote_url?: string;
            quote_id?: string;
            action?: string;
            ok?: boolean;
          };
          if (typeof ft.quote_url === "string") quoteUrl = ft.quote_url;
          if (ft.quote_id) lastQuoteId = String(ft.quote_id);
          if (ft.action === "request_human" && ft.ok) humanHandoffSent = true;
        }
        if (
          toolCall.tool === "catering_calendar" ||
          toolCall.tool === "check_capacity"
        ) {
          const hold = (toolResult as { hold?: { id?: string } }).hold;
          if (hold?.id) lastHoldId = String(hold.id);
        }
        if (
          toolCall.tool === "build_plan" &&
          Array.isArray((toolResult as { lines?: unknown }).lines)
        ) {
          const planLines = parseMenuLines(
            (toolResult as { lines: unknown }).lines
          );
          if (planLines.length) {
            engineLines = planLines;
            engineLinesTitle =
              typeof (toolResult as { lines_title?: string }).lines_title ===
              "string"
                ? String((toolResult as { lines_title: string }).lines_title)
                : null;
            const tot = (toolResult as { lines_total?: number }).lines_total;
            engineLinesTotal =
              tot != null && Number.isFinite(Number(tot))
                ? Number(tot)
                : null;
          }
        }
      }
      result = await sendModel(
        [
          `Tool ${toolCall.tool} result (cite these numbers; do not invent):`,
          JSON.stringify(toolResult),
          toolCall.tool === "build_plan"
            ? "Copy lines, lines_total, and lines_title from this build_plan result into your answer JSON. In reply, use each line’s reason. Do not add a dish or a price."
            : "Now return compact answer JSON: reply + every menu line from the tool (up to 12) with name/quantity/unit/price + lines_total, or one more tool_call if essential.",
          "Keep the JSON short so it is not truncated. Never use Markdown **.",
          "If cart_proposal is present, tell the guest they can tap Add to Build order.",
          "If quote_url is present, do NOT put the URL, localhost, or any web address in reply. Say you emailed the quotation. The chat already shows a button for the link.",
        ].join("\n")
      );
      parsed = safeParse(modelText(result));
      continue;
    }

    const type = String(parsed.type || "").toLowerCase();
    const ids = parsed.skill_ids ?? parsed.skillIds;
    if (
      (type === "load_skill" || type === "load_skills") &&
      Array.isArray(ids) &&
      ids.length
    ) {
      const { loaded: newly } = loadChatSkills(ids.map(String).slice(0, 2));
      for (const item of newly) {
        if (!loaded[item.id]) {
          loaded[item.id] = item.content;
          skillsUsed.push(item.id);
        }
      }
      result = await sendModel(
        `Skills loaded.\n${formatLoadedSkills(loaded)}\nReturn compact answer JSON (reply + every planned line, up to 12) or one tool_call.`
      );
      parsed = safeParse(modelText(result));
      continue;
    }

    break;
  }

  if (
    isFallbackReply(parsed) ||
    !String(parsed.reply || "").trim() ||
    String(parsed.type || "").toLowerCase() === "tool_call"
  ) {
    parsed = contextualFallback();
  }

  const replyRaw = parsed.reply;
  let reply =
    typeof replyRaw === "string" && replyRaw.trim()
      ? replyRaw
          .trim()
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
      : String(contextualFallback().reply || FALLBACK_REPLY);
  if (voiceMode || channel === "web_chat") {
    reply = replyWithoutQuoteUrl(reply);
    if (!reply && quoteUrl) {
      reply =
        "I've emailed your catering quotation. You can open it with the button here.";
    }
  }
  if (looksInternal(reply)) {
    console.error("[chat] blocked internal text from guest reply:", reply.slice(0, 280));
    reply = INTERNAL_REPLY_SUBSTITUTE;
  }

  const rawHighlights = Array.isArray(parsed.highlights)
    ? (parsed.highlights as { label?: string; value?: string }[])
        .filter((h) => h && (h.label || h.value))
        .slice(0, 6)
        .map((h) => ({
          label: String(h.label || "Note"),
          value: String(h.value || ""),
        }))
    : [];
  const knownGuests =
    orderDraft.adults != null && orderDraft.adults > 0
      ? orderDraft.adults + (orderDraft.kids || 0)
      : leadGuests ?? ctxGuests;
  const knownDiet = String(
    orderDraft.diet || leadForModel.diet || ctxDiet || ""
  ).trim();
  const knownDate = String(
    orderDraft.event_date || leadForModel.event_date || ctxDate || ""
  ).trim();
  // Prefer guest memory totals when present
  const memoryGuests =
    guestMemory?.headcount?.total != null && guestMemory.headcount.total > 0
      ? guestMemory.headcount.total
      : knownGuests;
  const memoryDate = String(guestMemory?.event?.date || knownDate).trim();
  const highlights = sanitizeHighlights(rawHighlights, {
    guests: memoryGuests,
    diet: knownDiet,
    date: memoryDate,
  });
  const bullets = Array.isArray(parsed.bullets)
    ? (parsed.bullets as unknown[])
        .map((b) => String(b).trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  let lines = parseMenuLines(parsed.lines ?? parsed.menu_lines);
  let lines_title =
    typeof parsed.lines_title === "string" && parsed.lines_title.trim()
      ? parsed.lines_title.trim()
      : null;
  let lines_total: number | null =
    parsed.lines_total != null && Number.isFinite(Number(parsed.lines_total))
      ? Number(parsed.lines_total)
      : null;
  // Prefer deterministic engine output when build_plan ran this turn
  if (engineLines?.length) {
    lines = engineLines;
    if (engineLinesTitle) lines_title = engineLinesTitle;
    if (engineLinesTotal != null) lines_total = engineLinesTotal;
  }
  if (lines_total == null && lines.length) {
    const sum = lines.reduce((s, l) => {
      if (l.line_total != null) return s + l.line_total;
      if (l.price != null) return s + l.price * l.quantity;
      return s;
    }, 0);
    if (sum > 0) lines_total = Math.round(sum * 100) / 100;
  }

  const lead = mergeLead(input.lead, {
    ...((parsed.lead as Partial<AgentLead>) || {}),
    event_date:
      orderDraft.event_date ||
      (parsed.lead as Partial<AgentLead> | undefined)?.event_date ||
      input.lead.event_date ||
      "",
  });
  const userAskedWhatsApp = /\b(whats?\s*app|wa\.me)\b/i.test(last.content);
  const offerWhatsApp =
    waReady &&
    (Boolean(parsed.offer_whatsapp) || userAskedHuman || userAskedWhatsApp);

  const finalProposal = proposalState.current;
  const transferCall = userAskedHuman && channel === "web_chat" && voiceConfigured();

  if (userAskedHuman && !humanHandoffSent) {
    const handoff = await notifyManagersOfHumanRequest({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      summary: [
        orderDraft.occasion ? `Occasion: ${orderDraft.occasion}` : null,
        orderDraft.event_date ? `Date: ${orderDraft.event_date}` : null,
        orderDraft.adults || orderDraft.kids
          ? `Guests: ${(orderDraft.adults || 0) + (orderDraft.kids || 0)}`
          : null,
        orderDraft.diet ? `Diet: ${orderDraft.diet}` : null,
        orderDraft.city || orderDraft.address
          ? `Location: ${[orderDraft.address, orderDraft.city].filter(Boolean).join(", ")}`
          : null,
        "Guest asked to speak with a person.",
      ]
        .filter(Boolean)
        .join(" · "),
      transcript: input.messages
        .filter((m) => m.content?.trim())
        .slice(-40)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 2000),
        })),
      orderDraft: orderDraft as unknown as Record<string, unknown>,
      quoteUrl,
    }).catch(() => null);
    if (handoff?.ok) {
      humanHandoffSent = true;
      toolsUsed.push("followthrough");
    }
  }

  if (transferCall) {
    reply = voiceMode
      ? "Sure — connecting you to our store manager now. If he can't pick up, our store manager will call you as soon as he is available."
      : "Sure — tap “Call store manager” below and I'll connect you right from your browser. If he can't pick up, our store manager will call you as soon as he is available.";
  } else if (humanHandoffSent) {
    const team = handoffTeamPhrase(people);
    const transferAckRe = new RegExp(
      `${chefToken}|${managerToken}|restaurant manager|forwarded|transferred|shared your`,
      "i"
    );
    const hasTransferAck = transferAckRe.test(reply);
    const hasContactPromise =
      /contact you shortly|reach out|will (call|contact|get back)/i.test(reply);
    const hasOfferMore =
      /assist you|help (you )?with|build (your )?order|send (you )?(a )?quote/i.test(
        reply
      );
    const closeBits: string[] = [];
    if (!hasTransferAck && !hasContactPromise) {
      closeBits.push(
        `I've shared your details with ${team} — they will contact you shortly.`
      );
    } else if (!hasContactPromise) {
      closeBits.push("They will contact you shortly.");
    }
    if (!hasOfferMore) {
      closeBits.push(
        "Is there anything I can assist you with now? I can help build your order or send you a quote."
      );
    }
    if (closeBits.length) {
      reply = `${reply.replace(/\s+$/, "")} ${closeBits.join(" ")}`.trim();
    }
  }

  let whatsappUrl: string | null = null;
  if (offerWhatsApp) {
    const digits = ownerWhatsAppE164();
    const draftGuests =
      (orderDraft.adults ?? 0) + (orderDraft.kids ?? 0) ||
      lead.guest_count ||
      null;
    const proposedLines = finalProposal?.items?.length
      ? finalProposal.items
          .slice(0, 8)
          .map((i) => `${i.quantity}× ${i.name}`)
          .join("; ")
      : null;
    const cartLines = input.order_context?.items?.length
      ? input.order_context.items
          .map((i) => `${i.quantity}× ${i.name}`)
          .join("; ")
      : null;
    const summary = [
      "Hi Yogiplate — I'd like help with catering.",
      lead.name ? `Name: ${lead.name}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      orderDraft.occasion ? `Occasion: ${orderDraft.occasion}` : null,
      orderDraft.event_date || lead.event_date
        ? `Event date: ${orderDraft.event_date || lead.event_date}${
            orderDraft.event_time ? ` ${orderDraft.event_time}` : ""
          }`
        : null,
      orderDraft.meal ? `Meal: ${orderDraft.meal}` : null,
      draftGuests ? `Guests: ${draftGuests}` : null,
      orderDraft.diet || lead.diet
        ? `Diet: ${orderDraft.diet || lead.diet}`
        : null,
      orderDraft.delivery_or_pickup
        ? `Service: ${orderDraft.delivery_or_pickup}`
        : null,
      orderDraft.city || lead.city
        ? `City: ${orderDraft.city || lead.city}`
        : null,
      orderDraft.address ? `Address: ${orderDraft.address}` : null,
      orderDraft.package_tier ? `Package: ${orderDraft.package_tier}` : null,
      orderDraft.budget ? `Budget: ${orderDraft.budget}` : null,
      orderDraft.setup_needs ? `Setup: ${orderDraft.setup_needs}` : null,
      orderDraft.notes || lead.notes
        ? `Notes: ${orderDraft.notes || lead.notes}`
        : null,
      lastHoldId ? `Calendar hold: ${lastHoldId}` : null,
      quoteUrl ? `Quote: ${quoteUrl}` : null,
      proposedLines ? `Proposed menu: ${proposedLines}` : null,
      cartLines && !proposedLines ? `Cart: ${cartLines}` : null,
      toolsUsed.length ? `Tools used: ${toolsUsed.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(summary)}`;
  }
  const hasCartProposal = !!(
    finalProposal &&
    Array.isArray(finalProposal.items) &&
    finalProposal.items.length > 0
  );

  await touchChatSession({
    session_id: sessionId,
    channel,
    lead_name: lead.name,
    lead_email: lead.email,
    lead_phone: lead.phone,
    tools_used: toolsUsed,
    skills_used: skillsUsed,
    offered_whatsapp: offerWhatsApp,
    cart_proposal: hasCartProposal,
    quote_created: Boolean(lastQuoteId),
    outcome: lastQuoteId
      ? "quote"
      : hasCartProposal
        ? "cart"
        : offerWhatsApp
          ? "escalated"
          : "browsing",
  }).catch(() => null);

  const addressQuery = verified_address?.ok
    ? null
    : addressCandidateForTurn({
        userText: "",
        draftAddress: orderDraft.address,
        draftCity: orderDraft.city || lead.city,
        prevDraftAddress: input.order_draft?.address || "",
      });
  if (addressQuery) {
    verified_address = await verifyAddress(
      addressQuery,
      orderDraft.city || lead.city || undefined
    ).catch(() => ({
      ok: false as const,
      query: addressQuery,
      error: "Could not verify that address right now.",
    }));
    if (verified_address.ok) {
      orderDraft = mergeOrderDraft(orderDraft, {
        address: verified_address.formatted,
      });
    }
  }

  // Mark chat event dates on the admin catering calendar (unconfirmed until paid)
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(orderDraft.event_date || ""))) {
    const foodCents = finalProposal?.items?.length
      ? finalProposal.items.reduce((sum, item) => sum + lineCents(item.price, item.quantity), 0)
      : 0;
    const foodTotal = foodCents ? fromCents(foodCents) : null;
    const itemsSummary = finalProposal?.items?.length
      ? finalProposal.items
          .slice(0, 12)
          .map((i) => `${i.quantity}× ${i.name}`)
          .join("; ")
      : null;
    await upsertCateringBooking({
      event_date: orderDraft.event_date,
      event_time: orderDraft.event_time || null,
      customer_name: lead.name,
      customer_email: lead.email,
      customer_phone: lead.phone,
      chat_session_id: sessionId,
      draft: orderDraft,
      quote_id: lastQuoteId,
      items_summary: itemsSummary,
      food_subtotal: foodTotal,
      amount_due: lastQuoteId ? undefined : foodTotal,
      status: "unconfirmed",
    }).catch(() => null);
  }

  const lastUserText = [...input.messages]
    .reverse()
    .find((m) => m.role === "user")?.content;
  const modelOffTopic =
    parsed.off_topic === true || parsed.off_topic === "true";
  const off_topic = voiceMode
    ? voiceTurnIsOffTopic(String(lastUserText || ""), modelOffTopic)
    : false;

  const quoteDeliveredEarlier = input.messages.some(
    (m) =>
      m.role === "assistant" &&
      /\b(emailed|texted you the quote|quote for quote number|quotation was emailed|Q-\d{8})/i.test(
        m.content
      )
  );
  const quoteDelivered =
    Boolean(quoteUrl) || Boolean(lastQuoteId) || quoteDeliveredEarlier;
  const modelEndCall =
    parsed.end_call === true || parsed.end_call === "true";
  const end_call =
    modelEndCall ||
    (quoteDelivered && guestIsClosingAfterQuote(String(lastUserText || "")));

  return {
    reply,
    highlights,
    bullets,
    lines,
    lines_total,
    lines_title,
    offer_whatsapp: offerWhatsApp,
    whatsapp_url: whatsappUrl,
    lead,
    order_draft: orderDraft,
    cart_proposal: finalProposal,
    quote_id: lastQuoteId,
    quote_url: quoteUrl,
    skills_used: [...new Set(skillsUsed)],
    tools_used: [...new Set(toolsUsed)],
    verified_address,
    off_topic,
    transfer_call: transferCall,
    end_call,
  };
}
