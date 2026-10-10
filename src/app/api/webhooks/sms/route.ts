import { NextResponse, after } from "next/server";
import { aiReplyForThread, recordInboundMessage } from "@/lib/channels/inbound";
import { reportError } from "@/lib/monitor";
import { serverEnv } from "@/lib/server-env";
import { sendSms } from "@/lib/sms";
import { updateDb } from "@/lib/store/local-db";
import { twilioWebhookUrl, validTwilioSignature } from "@/lib/twilio-voice";

export const runtime = "nodejs";
export const maxDuration = 26;

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

/** Carrier opt-out keywords. Twilio sends the confirmation reply itself and blocks further texts. */
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);
const HELP_WORDS = new Set(["help", "info"]);

/**
 * Twilio "A message comes in" webhook for the store number.
 * Saves the text for the desk right away and answers Twilio at once (Twilio
 * gives up after 15 s); AI Yogi's reply is sent afterwards by the REST API.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let from = "";
  let bodyText = "";
  let messageSid = "";

  try {
    if (contentType.includes("application/json")) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unsupported" }, { status: 415 });
      }
      const json = (await req.json()) as { From?: string; Body?: string };
      from = String(json.From || "");
      bodyText = String(json.Body || "");
    } else {
      const form = await req.formData();
      const params: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") params[key] = value;
      }
      if (
        serverEnv("TWILIO_AUTH_TOKEN") &&
        !validTwilioSignature(twilioWebhookUrl(req), params, req.headers.get("x-twilio-signature"))
      ) {
        await reportError("sms-webhook", "Twilio signature check failed for an incoming text", {
          url: twilioWebhookUrl(req),
        });
        return new NextResponse("Forbidden", { status: 403 });
      }
      from = params.From || "";
      bodyText = params.Body || "";
      messageSid = params.MessageSid || params.SmsSid || "";
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!from || !bodyText.trim()) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  const { threadId, aiPaused } = await recordInboundMessage({
    channel: "sms",
    external_id: from.replace(/\D/g, "") || from,
    text: bodyText,
    lead: { phone: from },
    meta: messageSid ? { sms_sid: messageSid } : undefined,
  });

  const keyword = bodyText.trim().toLowerCase().replace(/[^a-z]/g, "");
  const isStop = STOP_WORDS.has(keyword);
  const isStart = START_WORDS.has(keyword);
  let optedOut = false;
  await updateDb((d) => {
    const t = (d.channel_threads || []).find((x) => x.id === threadId);
    if (!t) return;
    if (isStop) t.sms_opted_out = true;
    else if (isStart) t.sms_opted_out = false;
    optedOut = Boolean(t.sms_opted_out);
  });
  if (isStop || isStart || HELP_WORDS.has(keyword) || optedOut) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  if (!aiPaused && serverEnv("GEMINI_API_KEY")) {
    after(async () => {
      const result = await aiReplyForThread(threadId);
      if (!result.ok) {
        if (result.error !== "no_guest_message") {
          await reportError("sms-ai", result.error, { from });
        }
        return;
      }
      const sent = await sendSms(from, result.reply);
      await updateDb((d) => {
        const t = (d.channel_threads || []).find((x) => x.id === threadId);
        const m = t?.messages.find((x) => x.id === result.message_id);
        if (m) m.meta = { ...(m.meta || {}), sms_status: sent.ok ? "sent" : "failed" };
      });
      if (!sent.ok) await reportError("sms-send", sent.error, { to: from });
    });
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
