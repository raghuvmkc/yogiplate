import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHAT_SKILL_CATALOG,
  buildLeanFrontDeskSystemPrompt,
  loadChatSkills,
} from "@/lib/chat/skills";

export const runtime = "nodejs";

const MAX_REACT_ROUNDS = 4;
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
  if (!ids.length) return "(none loaded yet)";
  return ids
    .map((id) => `### SKILL \`${id}\`\n${loaded[id]}`)
    .join("\n\n");
}

function isLoadAction(parsed: Record<string, unknown>): string[] | null {
  const type = String(parsed.type || parsed.action || "").toLowerCase();
  const ids = parsed.skill_ids ?? parsed.skillIds;
  if (
    (type === "load_skill" || type === "load_skills" || type === "tool") &&
    Array.isArray(ids)
  ) {
    return ids.map(String).slice(0, 3);
  }
  // Also accept bare skill_ids without type if no reply yet
  if (!parsed.reply && Array.isArray(ids)) {
    return ids.map(String).slice(0, 3);
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat is not configured (missing GEMINI_API_KEY)." },
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
      },
      { status: 400 }
    );
  }

  if (body.lead.name.trim().length < 2) {
    return NextResponse.json(
      { error: "Please enter your name to start chat." },
      { status: 400 }
    );
  }

  const phoneDigits = body.lead.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return NextResponse.json(
      { error: "Please enter a valid phone number to start chat." },
      { status: 400 }
    );
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from the user." },
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
      maxOutputTokens: 1400,
      responseMimeType: "application/json",
    },
  });

  const leadHint = body.lead
    ? `\n\n[Known lead so far: ${JSON.stringify(body.lead)}]`
    : "";
  const orderHint = body.order_context
    ? `\n\n[Guest's current Build-order cart — treat as live context:\n${JSON.stringify(body.order_context, null, 2)}]`
    : "";

  const loaded: Record<string, string> = {};
  const skillsUsed: string[] = [];

  try {
    const chat = model.startChat({ history });

    let parsed: Record<string, unknown> | null = null;

    for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
      const turn = [
        last.content,
        leadHint,
        orderHint,
        "",
        "--- ReAct ---",
        `Round ${round + 1} of ${MAX_REACT_ROUNDS}.`,
        "Loaded skills:",
        formatLoadedSkills(loaded),
        "",
        "Return ONLY JSON in one of these shapes:",
        `1) Load more knowledge (1–3 ids from catalog): {"type":"load_skill","skill_ids":["business"]}`,
        `2) Final guest answer: {"type":"answer","reply":"...","offer_whatsapp":false,"lead":{"name":"","phone":"","email":"","event_date":"","guest_count":null,"diet":"","city":"","notes":""}}`,
        "For 'Who is the chef?' load `business` then answer.",
        `Available skill ids: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`,
      ].join("\n");

      const result = await chat.sendMessage(turn);
      const text = result.response.text();
      parsed = extractJson(text);

      const toLoad = isLoadAction(parsed);
      if (toLoad?.length) {
        const { loaded: newly, skipped } = loadChatSkills(toLoad);
        for (const item of newly) {
          if (!loaded[item.id]) {
            loaded[item.id] = item.content;
            skillsUsed.push(item.id);
          }
        }
        if (skipped.length) {
          // Tell model next round via loaded blob; continue loop.
        }
        // If nothing new loaded, force answer next.
        if (!newly.length) {
          const force = await chat.sendMessage(
            `Those skill ids were invalid (${skipped.join(", ") || "none"}). Return the final answer JSON now using whatever you know, preferring not to invent menu prices.`
          );
          parsed = extractJson(force.response.text());
          break;
        }
        continue;
      }

      // Treat as final answer
      break;
    }

    if (!parsed) {
      throw new Error("Empty model response");
    }

    // If still a load action after max rounds, force answer with what we have.
    if (isLoadAction(parsed)) {
      const force = await chat.sendMessage(
        `Stop loading skills. Using only loaded skills below, return final answer JSON now.\n${formatLoadedSkills(loaded)}`
      );
      parsed = extractJson(force.response.text());
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
    return NextResponse.json(
      {
        error:
          "Sorry — the front desk chat is briefly unavailable. Please try again, or use Build order.",
        detail: process.env.NODE_ENV === "development" ? detail : undefined,
        // Safe short code so Netlify logs / support can tell Gemini vs other failures
        code: /API_KEY|api key|403|401/i.test(detail)
          ? "gemini_auth"
          : /404|not found|model/i.test(detail)
            ? "gemini_model"
            : "gemini_error",
      },
      { status: 502 }
    );
  }
}
