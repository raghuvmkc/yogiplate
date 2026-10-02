/**
 * Twilio SMS — same mechanism as Stone Craft Pizza (REST, no SDK).
 * Branding in message bodies uses Yogiplate.
 */

function env(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

export function smsConfigured(): boolean {
  return Boolean(
    env("TWILIO_ACCOUNT_SID") &&
      env("TWILIO_AUTH_TOKEN") &&
      env("TWILIO_FROM_NUMBER")
  );
}

/** Normalize to E.164; assume US (+1) when 10 digits. */
export function toE164(phone: string): string | null {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+") && /^\+[1-9]\d{7,14}$/.test(raw.replace(/[^\d+]/g, ""))) {
    return `+${raw.replace(/\D/g, "")}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function managerNotifyPhones(): string[] {
  const raw =
    env("MANAGER_NOTIFY_PHONES") ||
    env("KITCHEN_SMS_PHONES") ||
    env("KITCHEN_SMS_PHONE");
  const nums = raw
    ? raw.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of nums) {
    const e164 = toE164(n);
    if (!e164 || seen.has(e164)) continue;
    seen.add(e164);
    out.push(e164);
  }
  return out;
}

export async function sendSms(
  to: string,
  body: string
): Promise<{ ok: true; sid: string; to: string } | { ok: false; error: string }> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    return { ok: false, error: "Twilio not configured" };
  }
  const dest = toE164(to);
  if (!dest) return { ok: false, error: "Invalid phone number" };

  const text = String(body || "").trim().slice(0, 1500);
  if (!text) return { ok: false, error: "Empty SMS body" };

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: dest,
          From: from,
          Body: text,
        }).toString(),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      error_message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.message || data.error_message || `Twilio HTTP ${res.status}`,
      };
    }
    return { ok: true, sid: String(data.sid || ""), to: dest };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function sendSmsMany(
  phones: string[],
  body: string
): Promise<{ sent: number; failed: number; results: Awaited<ReturnType<typeof sendSms>>[] }> {
  const results: Awaited<ReturnType<typeof sendSms>>[] = [];
  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    const r = await sendSms(phone, body);
    results.push(r);
    if (r.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed, results };
}
