import { NextResponse } from "next/server";
import { handleChannelInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";
export const maxDuration = 26;

/**
 * WhatsApp Cloud API / Meta webhook adapter.
 * Verify token: WHATSAPP_VERIFY_TOKEN
 * App secret optional; inbound uses CHANNEL_INBOUND_SECRET pattern via phone id.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || "";
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Meta-style payload (best-effort parse)
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  const changes =
    entry && typeof entry === "object" && Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: { value?: { messages?: unknown[]; contacts?: { profile?: { name?: string }; wa_id?: string }[] } }[] }).changes
      : [];
  const value = changes[0]?.value;
  const msg = value?.messages?.[0] as
    | { from?: string; text?: { body?: string }; type?: string }
    | undefined;
  const contact = value?.contacts?.[0];

  if (!msg?.from || !msg.text?.body) {
    // Acknowledge non-message events
    return NextResponse.json({ received: true, ignored: true });
  }

  const result = await handleChannelInbound({
    channel: "whatsapp",
    external_id: msg.from,
    text: msg.text.body,
    lead: {
      name: contact?.profile?.name || "",
      phone: msg.from,
    },
  });

  // Outbound WhatsApp send is provider-specific; reply is stored in inbox for now.
  return NextResponse.json({
    received: true,
    ok: result.ok,
    reply: result.ok ? result.reply : null,
    thread_id: "thread_id" in result ? result.thread_id : null,
  });
}
