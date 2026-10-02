import { NextResponse } from "next/server";
import { z } from "zod";
import { sendChatSummaryEmail, smtpConfigured } from "@/lib/smtp";

export const runtime = "nodejs";
export const maxDuration = 30;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const BodySchema = z.object({
  session_id: z.string().min(4).max(80),
  lead: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(7).max(40),
    email: z.string().email().max(200),
  }),
  messages: z.array(MessageSchema).min(1).max(80),
  order_draft: z.record(z.string(), z.unknown()).nullable().optional(),
  cart_hint: z.string().max(500).optional(),
});

function buildSummary(
  messages: { role: string; content: string }[],
  lead: { name: string; phone: string; email: string },
  cartHint?: string
) {
  const userTurns = messages.filter((m) => m.role === "user");
  const assistantTurns = messages.filter((m) => m.role === "assistant");
  const topics = userTurns
    .map((m) => m.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((t, i) => `${i + 1}. ${t.length > 220 ? `${t.slice(0, 217)}…` : t}`);

  return [
    `${lead.name} (${lead.email}, ${lead.phone}) finished an AI Yogi chat.`,
    `Turns: ${userTurns.length} guest / ${assistantTurns.length} agent.`,
    cartHint ? `Cart context: ${cartHint}` : null,
    "",
    "Guest asks / statements:",
    topics.length ? topics.join("\n") : "(no guest messages beyond greeting)",
    "",
    "Latest agent reply:",
    assistantTurns.length
      ? assistantTurns[assistantTurns.length - 1]!.content.slice(0, 500)
      : "(none)",
  ]
    .filter((line) => line != null)
    .join("\n");
}

export async function POST(req: Request) {
  if (!smtpConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured.", code: "no_smtp" },
      { status: 503 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid chat summary payload.", code: "bad_request" },
      { status: 400 }
    );
  }

  // Need at least one real guest turn (not only the welcome bubble)
  const userMessages = body.messages.filter((m) => m.role === "user");
  if (!userMessages.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_user_messages",
    });
  }

  try {
    const summary = buildSummary(
      body.messages,
      body.lead,
      body.cart_hint
    );
    await sendChatSummaryEmail({
      sessionId: body.session_id,
      name: body.lead.name,
      phone: body.lead.phone,
      email: body.lead.email,
      summary,
      transcript: body.messages.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 4000),
      })),
      orderDraft: body.order_draft ?? null,
      cartHint: body.cart_hint,
    });
    // Never expose recipient addresses to the client
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[chat/summary]", err);
    return NextResponse.json(
      { error: "Could not send chat summary email.", code: "send_failed" },
      { status: 500 }
    );
  }
}
