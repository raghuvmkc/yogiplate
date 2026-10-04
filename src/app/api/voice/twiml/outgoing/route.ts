import {
  consumeCallTicket,
  readTwilioForm,
  twilioWebhookUrl,
  twiml,
  validTwilioSignature,
  voiceFromNumber,
  xmlEscape,
} from "@/lib/twilio-voice";

export async function POST(req: Request) {
  const params = await readTwilioForm(req);
  const signature = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(twilioWebhookUrl(req), params, signature)) {
    return new Response("Forbidden", { status: 403 });
  }
  const ticketId = params.Ticket || params.ticket || "";
  const to = await consumeCallTicket(ticketId);
  const from = voiceFromNumber();
  if (!to || !from) {
    const xml = twiml(
      `<Say voice="Polly.Joanna">This call could not be placed. Please try again from the desk.</Say>`
    );
    return new Response(xml, { headers: { "Content-Type": "text/xml" } });
  }
  const xml = twiml(
    `<Dial callerId="${xmlEscape(from)}"><Number>${xmlEscape(to)}</Number></Dial>`
  );
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
