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
    `<Dial timeout="25"><Client>${xmlEscape(MANAGER_VOICE_IDENTITY)}</Client></Dial><Say voice="Polly.Joanna">Sorry, the manager is not available right now. Please call again in a few minutes.</Say>`
  );
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
