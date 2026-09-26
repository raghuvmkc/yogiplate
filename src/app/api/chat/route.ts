import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHAT_SKILL_CATALOG,
  buildLeanFrontDeskSystemPrompt,
  loadChatSkills,
  type ChatSkillId,
} from "@/lib/chat/skills";

export const runtime = "nodejs";
export const maxDuration = 26;

const GEMINI_MODEL = "gemini-3.8-flash";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  lead: z.object({
    name: z.string().min(2),
    phone: z.string().min(7),
    email: z.string().email(),
    event_date: z.string().optional(),
    guest_count: z.number().nullable().optional(),
    diet: z.string().optional(),
    city: z.string().optional(),
    notes: z.string().optional(),
  }),
  order_context: z
    .object({
      page: z.string().optional(),
      diet: z.string().nullable().optional(),
      guest_count: z.number().optional(),
      event_date: z.string().optional(),
      notes: z.string().optional(),
      item_count: z.number().optional(),
      subtotal: z.number().optional(),
      items: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string().optional(),
            price: z.number().optional(),
          })
        )
        .max(80)
        .optional(),
    })
    .optional(),
});

const LeadSchema = z.object({
  name: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  event_date: z.string().optional().default(""),
  guest_count: z.number().nullable().optional().default(null),
  diet: z.string().optional().default(""),
  city: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

type ChatLead = z.infer<typeof LeadSchema>;

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

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
    throw new Error("Model did not return JSON");
  }
}

function mergeLead(
  prev: ChatLead | undefined,
  next: Partial<ChatLead>
): ChatLead {
  const base = LeadSchema.parse(prev || {});
  return LeadSchema.parse({
    name: next.name || base.name,
    phone: next.phone || base.phone,
    email: next.email || base.email,
    event_date: next.event_date || base.event_date,
    guest_count:
      next.guest_count === undefined ? base.guest_count : next.guest_count,
    diet: next.diet || base.diet,
    city: next.city || base.city,
    notes: next.notes || base.notes,
  });
}

function formatLoadedSkills(loaded: Record<string, string>): string {
  const ids = Object.keys(loaded);
  if (!ids.length) return "(none)";
  return ids.map((id) => `### SKILL \`${id}\`\n${loaded[id]}`).join("\n\n");
}

/** Prefetch a small skill set so we usually need only ONE Gemini call (Netlify time limits). */
function prefetchSkillIds(userText: string): ChatSkillId[] {
  const t = userText.toLowerCase();
  const ids = new Set<ChatSkillId>(["business", "ordering", "diets"]);

  if (/whatsapp|text me|call me|human|owner|speak to/.test(t)) {
    ids.add("whatsapp");
  }
  if (/menu|dish|food|tray|price|cost|\$|order|cater/.test(t)) {
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

function errorCode(detail: string): string {
  if (/API_KEY|api key|403|401|PERMISSION|invalid.*key/i.test(detail)) {
    return "gemini_auth";
  }
  if (/404|not found|model/i.test(detail)) return "gemini_model";
  if (/timeout|timed out|Deadline|ETIMEDOUT/i.test(detail)) {
    return "timeout";
  }
  return "gemini_error";
}

export async function POST(req: Request) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat is not configured (missing GEMINI_API_KEY).", code: "no_key" },
      { status: 503 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "Name, phone, and email are required before chat can start. Please share all three to continue.",
        code: "bad_request",
      },
      { status: 400 }
    );
  }

  if (body.lead.name.trim().length < 2) {
    return NextResponse.json(
      { error: "Please enter your name to start chat.", code: "bad_name" },
      { status: 400 }
    );
  }

  const phoneDigits = body.lead.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return NextResponse.json(
      { error: "Please enter a valid phone number to start chat.", code: "bad_phone" },
      { status: 400 }
    );
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from the user.", code: "bad_role" },
      { status: 400 }
    );
  }

  const waReady = whatsappConfigured();
  const system = buildLeanFrontDeskSystemPrompt(waReady);

  const history = body.messages.slice(0, -1).map((m) => ({
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
      temperature: 0.35,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
    },
  });

  const leadHint = `\n\n[Known lead: ${JSON.stringify(body.lead)}]`;
  const orderHint = body.order_context
    ? `\n\n[Cart:\n${JSON.stringify(body.order_context)}]`
    : "";

  const prefetch = prefetchSkillIds(last.content);
  const { loaded: preloaded } = loadChatSkills(prefetch);
  const loaded: Record<string, string> = {};
  const skillsUsed: string[] = [];
  for (const item of preloaded) {
    loaded[item.id] = item.content;
    skillsUsed.push(item.id);
  }

  try {
    const chat = model.startChat({ history });

    const turn = [
      last.content,
      leadHint,
      orderHint,
      "",
      "Relevant kitchen knowledge (already loaded — answer now):",
      formatLoadedSkills(loaded),
      "",
      "Return ONLY JSON:",
      `{"type":"answer","reply":"...","offer_whatsapp":false,"lead":{"name":"","phone":"","email":"","event_date":"","guest_count":null,"diet":"","city":"","notes":""}}`,
      "Keep reply warm and concise. Do not invent prices not in the knowledge above.",
      `If you truly need another skill, you may instead return {"type":"load_skill","skill_ids":["..."]} once. Available: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`,
    ].join("\n");

    let result = await chat.sendMessage(turn);
    let parsed = extractJson(result.response.text());

    // At most one optional skill-load round (keeps Netlify under time limits)
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
        `Skills loaded. Answer the guest now as final JSON only.\n${formatLoadedSkills(loaded)}`
      );
      parsed = extractJson(result.response.text());
    }

    const replyRaw = parsed.reply;
    const reply =
      typeof replyRaw === "string" && replyRaw.trim()
        ? replyRaw.trim()
        : "I can help with Yogiplate catering menus, diets, and orders. What would you like to know?";

    const lead = mergeLead(
      body.lead as ChatLead | undefined,
      (parsed.lead as Partial<ChatLead>) || {}
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
        body.order_context?.items?.length
          ? `Cart: ${body.order_context.items
              .map((i) => `${i.quantity}× ${i.name}`)
              .join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(summary)}`;
    }

    return NextResponse.json({
      reply,
      offer_whatsapp: offerWhatsApp,
      whatsapp_url: whatsappUrl,
      lead,
      skills_used: [...new Set(skillsUsed)],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[chat]", detail);
    const safeDetail = detail.replace(/key=[^&\s]+/gi, "key=***").slice(0, 240);
    return NextResponse.json(
      {
        error:
          "Sorry — the front desk chat is briefly unavailable. Please try again, or use Build order.",
        code: errorCode(detail),
        detail: safeDetail,
      },
      { status: 502 }
    );
  }
}
