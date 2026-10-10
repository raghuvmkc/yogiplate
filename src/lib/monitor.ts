import { siteUrl } from "@/lib/site";
import { sendSystemAlertEmail, smtpConfigured } from "@/lib/smtp";
import { readMonitor, writeMonitor, type SystemEvent } from "@/lib/store/monitor-store";

const ALERT_EVERY_MS = 30 * 60 * 1000;

const AREA_LABELS: Record<string, string> = {
  checkout: "Online checkout (Pay with Stripe)",
  "email-invoice": "Email-me-an-invoice form",
  "invoice-email": "Invoice email delivery",
  "delivery-quote": "Address check / delivery fee",
  chat: "AI Yogi chat",
  "stripe-webhook": "Stripe payment confirmation",
  "checkout-confirm": "Order success page",
  "quote-deposit": "Quote deposit payment",
  "corporate-inquiry": "Corporate inquiry form",
  "sms-webhook": "Incoming texts (Twilio webhook)",
  "sms-ai": "AI Yogi reply to a text",
  "sms-send": "Sending a text message",
  browser: "Customer's browser (page crashed or script error)",
  server: "Server error",
  health: "Health check",
};

function redact(text: string) {
  return text
    .replace(/\b(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_***")
    .replace(/key=[^&\s]+/gi, "key=***")
    .replace(/(password|secret|token)["':=\s]+[^\s"',}]+/gi, "$1=***");
}

function messageOf(err: unknown) {
  if (err instanceof Error) return err.message || err.name;
  return typeof err === "string" ? err : JSON.stringify(err);
}

/**
 * Record a customer-facing failure: Netlify log, the admin Health page, and an
 * alert email (at most one per area every 30 minutes). Never throws.
 */
export async function reportError(
  area: string,
  err: unknown,
  info: Record<string, string | number | boolean | null | undefined> = {}
) {
  const message = redact(messageOf(err)).slice(0, 500);
  const detail = redact(
    Object.entries(info)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")
  ).slice(0, 1500);
  console.error(`[monitor:${area}]`, message, detail ? `\n${detail}` : "");

  try {
    const now = new Date();
    const state = await readMonitor();
    const event: SystemEvent = {
      id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: now.toISOString(),
      area,
      message,
      path: typeof info.path === "string" ? info.path : undefined,
      detail: detail || undefined,
    };
    state.events.unshift(event);

    const last = Date.parse(state.last_alert[area] || "") || 0;
    const shouldAlert = smtpConfigured() && now.getTime() - last > ALERT_EVERY_MS;
    if (shouldAlert) state.last_alert[area] = event.at;
    await writeMonitor(state);

    if (shouldAlert) {
      const recentSame = state.events.filter(
        (e) => e.area === area && Date.parse(e.at) > now.getTime() - ALERT_EVERY_MS
      ).length;
      const label = AREA_LABELS[area] || area;
      await sendSystemAlertEmail({
        subject: `Yogiplate site problem: ${label}`,
        text: [
          `Something failed for a customer on the Yogiplate site.`,
          ``,
          `Where: ${label}`,
          `When: ${now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} (Pacific)`,
          `Error: ${message}`,
          detail ? `\n${detail}` : null,
          ``,
          recentSame > 1 ? `This happened ${recentSame} times in the last 30 minutes.` : null,
          `You will get at most one email per problem area every 30 minutes.`,
          ``,
          `Health page: ${siteUrl()}/admin/health`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      });
    }
  } catch (monitorErr) {
    console.error("[monitor] could not record or alert:", messageOf(monitorErr));
  }
}

export async function recentEvents(limit = 50) {
  return (await readMonitor()).events.slice(0, limit);
}
