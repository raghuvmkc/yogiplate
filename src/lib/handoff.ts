import {
  sendManagerHandoffEmail,
  smtpConfigured,
} from "@/lib/smtp";
import {
  managerNotifyPhones,
  sendSmsMany,
  smsConfigured,
} from "@/lib/sms";
import { handoffTeamPhrase, managerWithTitle } from "@/lib/people";

export type HandoffInput = {
  name: string;
  phone: string;
  email: string;
  summary: string;
  transcript?: { role: string; content: string }[];
  orderDraft?: Record<string, unknown> | null;
  quoteUrl?: string | null;
};

export async function notifyManagersOfHumanRequest(input: HandoffInput) {
  const emailResult = { sent: false, error: "" as string };
  const smsResult = { sent: 0, failed: 0, error: "" as string };

  if (smtpConfigured()) {
    try {
      await sendManagerHandoffEmail(input);
      emailResult.sent = true;
    } catch (e) {
      emailResult.error = e instanceof Error ? e.message : String(e);
    }
  } else {
    emailResult.error = "SMTP not configured";
  }

  const phones = managerNotifyPhones();
  if (smsConfigured() && phones.length) {
    const smsBody = [
      `Yogiplate — guest wants a person (${managerWithTitle()})`,
      `${input.name || "Guest"} · ${input.phone || "no phone"}`,
      input.email ? `Email: ${input.email}` : null,
      input.summary ? input.summary.slice(0, 280) : null,
      input.quoteUrl ? `Quote: ${input.quoteUrl}` : null,
      "Please call them back soon.",
    ]
      .filter(Boolean)
      .join("\n");
    const r = await sendSmsMany(phones, smsBody);
    smsResult.sent = r.sent;
    smsResult.failed = r.failed;
    if (!r.sent) {
      smsResult.error =
        r.results.find((x) => !x.ok && "error" in x)?.error ||
        "SMS send failed";
    }
  } else if (!smsConfigured()) {
    smsResult.error = "Twilio not configured";
  } else {
    smsResult.error = "No MANAGER_NOTIFY_PHONES configured";
  }

  const ok = emailResult.sent || smsResult.sent > 0;
  const team = handoffTeamPhrase();
  return {
    ok,
    email_sent: emailResult.sent,
    email_error: emailResult.error || undefined,
    sms_sent: smsResult.sent,
    sms_failed: smsResult.failed,
    sms_error: smsResult.error || undefined,
    summary: ok
      ? `Forwarded to ${team} by ${[
          emailResult.sent ? "email" : null,
          smsResult.sent > 0 ? `SMS (${smsResult.sent})` : null,
        ]
          .filter(Boolean)
          .join(" + ")}. Tell the guest they will be contacted shortly.`
      : `Could not notify ${team} (${[emailResult.error, smsResult.error].filter(Boolean).join("; ")}). Ask them to try again or use Corporate catering.`,
  };
}
