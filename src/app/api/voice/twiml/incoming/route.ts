import {
  MANAGER_VOICE_IDENTITY,
  readTwilioForm,
  twilioWebhookUrl,
  twiml,
  validTwilioSignature,
  xmlEscape,
} from "@/lib/twilio-voice";

export async function POST(req: Request) {
  const params = await readTwilioForm(req);
  const signature = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(twilioWebhookUrl(req), params, signature)) {
    return new Response("Forbidden", { status: 403 });
  }
  const xml = twiml(
    `<Dial timeout="25"><Client>${xmlEscape(MANAGER_VOICE_IDENTITY)}</Client></Dial><Say voice="Polly.Joanna">Sorry, our store manager couldn't pick up right now. Our store manager will call you as soon as he is available. Thank you for calling Yogiplate.</Say>`
  );
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
