import {
  GUEST_IDENTITY_PREFIX,
  MANAGER_VOICE_IDENTITY,
  consumeCallTicket,
  readTwilioForm,
  twilioWebhookUrl,
  twiml,
  validTwilioSignature,
  voiceFromNumber,
  xmlEscape,
} from "@/lib/twilio-voice";

function clean(value: string | undefined, max: number) {
  return String(value || "")
    .replace(/[^\p{L}\p{N} +().@'-]/gu, "")
    .trim()
    .slice(0, max);
}

/** Website guest asked AI Yogi for a person: ring the manager desk, then hand off to transfer-done. */
function guestTransfer(params: Record<string, string>) {
  const name = clean(params.GuestName, 60) || "Website guest";
  const phone = clean(params.GuestPhone, 20);
  const action = `/api/voice/twiml/transfer-done?${new URLSearchParams({ name, phone }).toString()}`;
  return twiml(
    `<Say voice="Polly.Joanna">Connecting you to our store manager. Please hold.</Say>` +
      `<Dial timeout="25" answerOnBridge="true" action="${xmlEscape(action)}" method="POST">` +
      `<Client><Identity>${xmlEscape(MANAGER_VOICE_IDENTITY)}</Identity>` +
      `<Parameter name="GuestName" value="${xmlEscape(name)}"/>` +
      `<Parameter name="GuestPhone" value="${xmlEscape(phone)}"/>` +
      `</Client></Dial>`
  );
}

export async function POST(req: Request) {
  const params = await readTwilioForm(req);
  const signature = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(twilioWebhookUrl(req), params, signature)) {
    return new Response("Forbidden", { status: 403 });
  }

  if ((params.From || params.Caller || "").startsWith(`client:${GUEST_IDENTITY_PREFIX}`)) {
    return new Response(guestTransfer(params), { headers: { "Content-Type": "text/xml" } });
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
