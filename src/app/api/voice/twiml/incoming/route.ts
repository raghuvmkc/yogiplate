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
  // Dial action is required so unanswered rings are handled in desk-done
  // (and show as missed) instead of the parent call quietly ending as "completed".
  const action = "/api/voice/twiml/desk-done";
  const xml = twiml(
    `<Dial timeout="25" answerOnBridge="true" action="${xmlEscape(action)}" method="POST">` +
      `<Client>${xmlEscape(MANAGER_VOICE_IDENTITY)}</Client>` +
      `</Dial>`
  );
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
