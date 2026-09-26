import { GoogleGenerativeAI } from "@google/generative-ai";
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
import {
  executeChatTool,
  parseToolCall,
  toolCatalogForPrompt,
} from "@/lib/chat/tools";
import { upsertCustomerFromLead } from "@/lib/crm";
import { getSettings } from "@/lib/repo";
import type { ContactChannel } from "@/lib/types";

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
  guest_count?: number;
  event_date?: string;
  notes?: string;
  item_count?: number;
  subtotal?: number;
  items?: {
    name: string;
    quantity: number;
    unit?: string;
    price?: number;
  }[];
};

export type AgentTurnInput = {
  messages: AgentMessage[];
  lead: AgentLead;
  order_context?: AgentOrderContext;
  order_draft?: Partial<OrderDraft>;
  session_id?: string;
  channel?: ContactChannel;
};

export type AgentTurnResult = {
  reply: string;
  highlights: { label: string; value: string }[];
  bullets: string[];
  offer_whatsapp: boolean;
  whatsapp_url: string | null;
  lead: AgentLead;
  order_draft: OrderDraft;
  cart_proposal: CartProposal | null;
  quote_id: string | null;
  quote_url: string | null;
  skills_used: string[];
  tools_used: string[];
};

function whatsappConfigured() {
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
        };
      }
    }
    if (parsed.type === "load_skill" || parsed.skill_ids || parsed.skillIds) {
      return parsed;
    }
  }

  const plain = stripCodeFences(text).trim();
  if (plain.length > 0 && !plain.startsWith("{")) {
    return {
      type: "answer",
      reply: plain.slice(0, 2000),
      offer_whatsapp: false,
      lead: {},
    };
  }

  throw new Error("empty_or_unparseable_response");
}

function modelText(result: {
  response: { text: () => string; candidates?: unknown };
}): string {
  try {
    return result.response.text() || "";
  } catch {
    return "";
  }
}

function mergeLead(prev: AgentLead, next: Partial<AgentLead>): AgentLead {
  return {
    name: next.name || prev.name,
    phone: next.phone || prev.phone,
    email: next.email || prev.email,
    event_date: next.event_date || prev.event_date || "",
    guest_count:
      next.guest_count === undefined ? prev.guest_count ?? null : next.guest_count,
    diet: next.diet || prev.diet || "",
    city: next.city || prev.city || "",
    notes: next.notes || prev.notes || "",
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
  if (/package|thali|combo/.test(t)) ids.add("menu-packages");
  if (/side|focaccia/.test(t)) ids.add("menu-sides");

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
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("missing_GEMINI_API_KEY");
  }

  const last = input.messages[input.messages.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("last_message_must_be_user");
  }

  const channel = input.channel || "web_chat";
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
  const system = [
    buildLeanFrontDeskSystemPrompt(waReady),
    "",
    toolCatalogForPrompt(),
    channel !== "web_chat"
      ? `\nCHANNEL: This turn arrived via ${channel}. Keep replies concise for that medium.`
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
      maxOutputTokens: 1400,
      responseMimeType: "application/json",
    },
  });

  let orderDraft: OrderDraft = mergeOrderDraft(EMPTY_ORDER_DRAFT, {
    ...(input.order_draft || {}),
    event_date:
      input.order_draft?.event_date ||
      input.lead.event_date ||
      input.order_context?.event_date ||
      "",
    adults:
      input.order_draft?.adults ??
      input.lead.guest_count ??
      input.order_context?.guest_count ??
      null,
    diet:
      input.order_draft?.diet ||
      input.lead.diet ||
      input.order_context?.diet ||
      "",
    city: input.order_draft?.city || input.lead.city || "",
    notes: input.order_draft?.notes || input.lead.notes || "",
  } as Partial<OrderDraft>);
  const proposalState: { current: CartProposal | null } = { current: null };
  let lastQuoteId: string | null = null;
  let quoteUrl: string | null = null;

  const leadHint = `\n\n[Known lead: ${JSON.stringify(input.lead)}]`;
  const orderHint = input.order_context
    ? `\n\n[Cart:\n${JSON.stringify(input.order_context)}]`
    : "";
  const draftHint = `\n\n[Order draft:\n${JSON.stringify(orderDraft)}]`;

  const prefetch = prefetchSkillIds(last.content);
  const { loaded: preloaded } = loadChatSkills(prefetch);
  const loaded: Record<string, string> = {};
  const skillsUsed: string[] = [];
  const toolsUsed: string[] = [];
  for (const item of preloaded) {
    loaded[item.id] = item.content;
    skillsUsed.push(item.id);
  }

  const chat = model.startChat({ history });

  const turn = [
    last.content,
    leadHint,
    orderHint,
    draftHint,
    "",
    "Relevant kitchen knowledge (already loaded):",
    formatLoadedSkills(loaded),
    "",
    "Return ONLY JSON: tool_call, load_skill, or answer (with reply + optional highlights/bullets).",
    "Use time_context + catering_calendar for dates; catering_math for headcount/trays; order_draft for cart; followthrough for email quote/deposit.",
    `Skill ids: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`,
  ].join("\n");

  let result = await chat.sendMessage(turn);
  let parsed = parseModelResponse(modelText(result));

  for (let round = 0; round < 4; round++) {
    const toolCall = parseToolCall(parsed);
    if (toolCall) {
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
      });
      toolsUsed.push(toolCall.tool);
      if (
        toolCall.tool === "followthrough" &&
        toolResult &&
        typeof toolResult === "object" &&
        "quote_url" in toolResult &&
        typeof (toolResult as { quote_url?: string }).quote_url === "string"
      ) {
        quoteUrl = (toolResult as { quote_url: string }).quote_url;
        if ("quote_id" in toolResult) {
          lastQuoteId = String(
            (toolResult as { quote_id?: string }).quote_id || lastQuoteId
          );
        }
      }
      result = await chat.sendMessage(
        [
          `Tool ${toolCall.tool} result (cite these numbers; do not invent):`,
          JSON.stringify(toolResult),
          "Now return answer JSON with reply + highlights for key numbers, or another tool_call if still needed.",
          "If cart_proposal is present, tell the guest they can tap Add to Build order in this chat.",
          "If quote_url is present, share that link for deposit / viewing the quote.",
        ].join("\n")
      );
      parsed = parseModelResponse(modelText(result));
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
      result = await chat.sendMessage(
        `Skills loaded.\n${formatLoadedSkills(loaded)}\nReturn answer JSON (reply + highlights) or a tool_call.`
      );
      parsed = parseModelResponse(modelText(result));
      continue;
    }

    break;
  }

  const replyRaw = parsed.reply;
  const reply =
    typeof replyRaw === "string" && replyRaw.trim()
      ? replyRaw.trim()
      : "I can help with Yogiplate catering menus, diets, and orders. What would you like to know?";

  const highlights = Array.isArray(parsed.highlights)
    ? (parsed.highlights as { label?: string; value?: string }[])
        .filter((h) => h && (h.label || h.value))
        .slice(0, 6)
        .map((h) => ({
          label: String(h.label || "Note"),
          value: String(h.value || ""),
        }))
    : [];
  const bullets = Array.isArray(parsed.bullets)
    ? (parsed.bullets as unknown[])
        .map((b) => String(b).trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const lead = mergeLead(
    input.lead,
    (parsed.lead as Partial<AgentLead>) || {}
  );
  const offerWhatsApp = Boolean(parsed.offer_whatsapp) && waReady;

  let whatsappUrl: string | null = null;
  if (offerWhatsApp) {
    const digits = ownerWhatsAppE164();
    const summary = [
      "Hi Yogiplate — I'd like help with catering.",
      lead.name ? `Name: ${lead.name}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.event_date ? `Event date: ${lead.event_date}` : null,
      lead.guest_count ? `Guests: ${lead.guest_count}` : null,
      lead.diet ? `Diet: ${lead.diet}` : null,
      lead.city ? `City: ${lead.city}` : null,
      lead.notes ? `Notes: ${lead.notes}` : null,
      quoteUrl ? `Quote: ${quoteUrl}` : null,
      input.order_context?.items?.length
        ? `Cart: ${input.order_context.items
            .map((i) => `${i.quantity}× ${i.name}`)
            .join("; ")}`
        : null,
      toolsUsed.length ? `Tools used: ${toolsUsed.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(summary)}`;
  }

  const finalProposal = proposalState.current;
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

  return {
    reply,
    highlights,
    bullets,
    offer_whatsapp: offerWhatsApp,
    whatsapp_url: whatsappUrl,
    lead,
    order_draft: orderDraft,
    cart_proposal: finalProposal,
    quote_id: lastQuoteId,
    quote_url: quoteUrl,
    skills_used: [...new Set(skillsUsed)],
    tools_used: [...new Set(toolsUsed)],
  };
}
