import crypto from "crypto";
import { toE164 } from "@/lib/sms";
import { getDb, uid, updateDb, type CallTicket } from "@/lib/store/local-db";

export const MANAGER_VOICE_IDENTITY = "yogiplate-manager";

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function voiceFromNumber() {
  return env("TWILIO_FROM_NUMBER");
}

export function voiceConfigured() {
  return Boolean(
    env("TWILIO_ACCOUNT_SID") &&
      env("TWILIO_AUTH_TOKEN") &&
      env("TWILIO_FROM_NUMBER") &&
      env("TWILIO_API_KEY") &&
      env("TWILIO_API_SECRET") &&
      env("TWILIO_TWIML_APP_SID")
  );
}

function base64url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Twilio Voice access token for the single manager browser. */
export function createManagerVoiceToken() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  const appSid = env("TWILIO_TWIML_APP_SID");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" })
  );
  const payload = base64url(
    JSON.stringify({
      jti: `${apiKey}-${now}`,
      iss: apiKey,
      sub: accountSid,
      nbf: now,
      exp: now + 60 * 60,
      grants: {
        identity: MANAGER_VOICE_IDENTITY,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: appSid },
        },
      },
    })
  );
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function twilioWebhookUrl(req: Request) {
  const url = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") || url.protocol.replace(":", ""))
    .split(",")[0]
    .trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host)
    .split(",")[0]
    .trim();
  return `${proto}://${host}${url.pathname}${url.search}`;
}

export function validTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
) {
  const token = env("TWILIO_AUTH_TOKEN");
  if (!token || !signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = crypto.createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function readTwilioForm(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function twiml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

export async function issueCallTicket(to: string): Promise<CallTicket | null> {
  const dest = toE164(to);
  if (!dest) return null;
  const ticket: CallTicket = {
    id: uid("call"),
    to: dest,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    used_at: null,
  };
  await updateDb((db) => {
    const now = Date.now();
    db.call_tickets = (db.call_tickets || []).filter(
      (row) => new Date(row.expires_at).getTime() > now
    );
    db.call_tickets.push(ticket);
  });
  return ticket;
}

/** Accept a ticket once. A Twilio retry within 20 seconds for the same number still passes. */
export async function consumeCallTicket(id: string): Promise<string | null> {
  const db = await getDb();
  const ticket = (db.call_tickets || []).find((row) => row.id === id);
  if (!ticket) return null;
  if (new Date(ticket.expires_at).getTime() < Date.now()) return null;
  if (ticket.used_at && Date.now() - new Date(ticket.used_at).getTime() > 20_000) {
    return null;
  }
  if (!ticket.used_at) {
    await updateDb((next) => {
      const row = (next.call_tickets || []).find((item) => item.id === id);
      if (row && !row.used_at) row.used_at = new Date().toISOString();
    });
  }
  return ticket.to;
}

export type VoiceCallRow = {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  duration: string;
  started_at: string;
};

export async function listVoiceCalls(): Promise<VoiceCallRow[]> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = voiceFromNumber();
  if (!sid || !token || !from) return [];
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;

  async function page(query: string) {
    const res = await fetch(`${base}?PageSize=40&${query}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      calls?: Array<Record<string, string>>;
    };
    return data.calls || [];
  }

  const [inbound, outbound] = await Promise.all([
    page(`To=${encodeURIComponent(from)}`),
    page(`From=${encodeURIComponent(from)}`),
  ]);
  const seen = new Set<string>();
  const rows: VoiceCallRow[] = [];
  for (const call of [...inbound, ...outbound]) {
    if (!call.sid || seen.has(call.sid)) continue;
    seen.add(call.sid);
    rows.push({
      sid: call.sid,
      from: call.from || "",
      to: call.to || "",
      status: call.status || "",
      direction: call.direction || "",
      duration: call.duration || "0",
      started_at: call.start_time || call.date_created || "",
    });
  }
  rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return rows.slice(0, 40);
}
