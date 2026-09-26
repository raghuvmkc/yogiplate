import { NextResponse } from "next/server";
import { handleChannelInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";
export const maxDuration = 26;

/**
 * Twilio-style SMS webhook (application/x-www-form-urlencoded or JSON).
 * Optional: TWILIO_AUTH_TOKEN for future signature validation.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let from = "";
  let bodyText = "";

  try {
    if (contentType.includes("application/json")) {
      const json = (await req.json()) as { From?: string; Body?: string };
      from = String(json.From || "");
      bodyText = String(json.Body || "");
    } else {
      const form = await req.formData();
      from = String(form.get("From") || "");
      bodyText = String(form.get("Body") || "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!from || !bodyText) {
    return NextResponse.json({ error: "Missing From/Body" }, { status: 400 });
  }

  const result = await handleChannelInbound({
    channel: "sms",
    external_id: from.replace(/\D/g, "") || from,
    text: bodyText,
    lead: { phone: from },
  });

  // TwiML-ish plain response (Twilio can also use MessagingResponse XML later)
  if (result.ok) {
    const safe = result.reply
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe.slice(0, 1500)}</Message></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
}
