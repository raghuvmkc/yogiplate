import { after } from "next/server";
import { managerNotifyPhones, sendSmsMany } from "@/lib/sms";
import {
  readTwilioForm,
  twilioWebhookUrl,
  twiml,
  validTwilioSignature,
} from "@/lib/twilio-voice";

export const runtime = "nodejs";

const MANAGER_UNAVAILABLE_LINE =
  "Sorry, our store manager couldn't pick up right now. Our store manager will call you as soon as he is available. Thank you for calling Yogiplate.";

/** Runs when the guest-to-manager Dial ends; if nobody answered, tell the guest and text the managers. */
export async function POST(req: Request) {
  const params = await readTwilioForm(req);
  if (!validTwilioSignature(twilioWebhookUrl(req), params, req.headers.get("x-twilio-signature"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const headers = { "Content-Type": "text/xml" };
  if (params.DialCallStatus === "completed") {
    return new Response(twiml("<Hangup/>"), { headers });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "Website guest";
  const phone = url.searchParams.get("phone") || "";
  const phones = managerNotifyPhones();
  if (phones.length) {
    after(() =>
      sendSmsMany(
        phones,
        `Yogiplate: missed call from the website chat — ${name}${phone ? `, ${phone}` : ""}. Please call back as soon as you can.`
      )
    );
  }
  return new Response(
    twiml(`<Say voice="Polly.Joanna">${MANAGER_UNAVAILABLE_LINE}</Say><Hangup/>`),
    { headers }
  );
}
