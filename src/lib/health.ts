import { geocodeDeliveryAddress } from "@/lib/geocode";
import { readMonitor } from "@/lib/store/monitor-store";
import { serverEnv } from "@/lib/server-env";
import { siteUrl } from "@/lib/site";
import { smtpConfigured } from "@/lib/smtp";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/store/local-db";

export type HealthCheck = {
  name: string;
  ok: boolean;
  /** Critical checks fail the whole health endpoint (HTTP 503) so uptime monitors alert. */
  critical: boolean;
  note: string;
};

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  checked_at: string;
  checks: HealthCheck[];
};

const EXTERNAL_CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; result: Omit<HealthCheck, "name" | "critical"> }>();

/** Outside services are checked at most every 10 minutes per server, to stay polite. */
async function cached(
  key: string,
  run: () => Promise<Omit<HealthCheck, "name" | "critical">>
) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < EXTERNAL_CACHE_MS) return hit.result;
  const result = await run().catch((err: unknown) => ({
    ok: false,
    note: err instanceof Error ? err.message.slice(0, 160) : "Check failed",
  }));
  cache.set(key, { at: Date.now(), result });
  return result;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

async function databaseCheck(): Promise<HealthCheck> {
  try {
    const db = await withTimeout(getDb(), 8000, "Database");
    const available = db.menu_items.filter((item) => item.is_available).length;
    return {
      name: "Database and menu",
      critical: true,
      ok: available > 0,
      note: available > 0 ? `${available} dishes available to order` : "No dishes are available to order",
    };
  } catch (err) {
    return {
      name: "Database and menu",
      critical: true,
      ok: false,
      note: err instanceof Error ? err.message.slice(0, 160) : "Could not read the database",
    };
  }
}

async function paymentsCheck(): Promise<HealthCheck> {
  const result = await cached("stripe", async () => {
    const stripe = getStripe();
    if (!stripe) return { ok: false, note: "Stripe secret key is not set" };
    await withTimeout(stripe.balance.retrieve(), 8000, "Stripe");
    const live = /\b(?:sk|rk)_live_/.test(serverEnv("STRIPE_SECRET_KEY"));
    return { ok: true, note: live ? "Stripe key works (live mode)" : "Stripe key works (TEST mode: no real charges)" };
  });
  return { name: "Payments (Stripe)", critical: true, ...result };
}

function emailCheck(): HealthCheck {
  const smtp = smtpConfigured();
  const resend = Boolean(serverEnv("RESEND_API_KEY"));
  return {
    name: "Email (invoices and quotes)",
    critical: true,
    ok: smtp || resend,
    note: smtp || resend
      ? `Configured via ${[smtp && "SMTP", resend && "Resend"].filter(Boolean).join(" and ")}`
      : "No email sender configured, so invoices cannot be emailed",
  };
}

function siteUrlCheck(): HealthCheck {
  const url = siteUrl();
  const onNetlify = process.env.NETLIFY === "true";
  const bad = onNetlify && /localhost|127\.0\.0\.1/.test(url);
  return {
    name: "Site address for links",
    critical: true,
    ok: !bad,
    note: bad
      ? "NEXT_PUBLIC_SITE_URL points to localhost, so pay links, logos and receipts break"
      : url,
  };
}

async function addressCheck(): Promise<HealthCheck> {
  const result = await cached("geocode", async () => {
    const hit = await withTimeout(
      geocodeDeliveryAddress({
        address: "200 E Santa Clara St",
        city: "San Jose",
        state: "CA",
        zip: "95113",
      }),
      9000,
      "Address lookup"
    );
    return hit.status === "ok"
      ? { ok: true, note: "Address lookup is answering" }
      : { ok: false, note: "Address lookup is not answering; customers cannot get a delivery fee" };
  });
  return { name: "Address check and delivery fee", critical: false, ...result };
}

async function chatCheck(): Promise<HealthCheck> {
  const key = serverEnv("GEMINI_API_KEY");
  if (!key) {
    return { name: "AI Yogi chat", critical: false, ok: false, note: "GEMINI_API_KEY is not set" };
  }
  const result = await cached("gemini", async () => {
    const res = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`),
      8000,
      "Gemini"
    );
    return res.ok
      ? { ok: true, note: "Gemini key works" }
      : { ok: false, note: `Gemini rejected the key (HTTP ${res.status})` };
  });
  return { name: "AI Yogi chat", critical: false, ...result };
}

async function recentErrorsCheck(): Promise<HealthCheck> {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = (await readMonitor()).events.filter((e) => Date.parse(e.at) > hourAgo);
  return {
    name: "Customer errors in the last hour",
    critical: false,
    ok: recent.length === 0,
    note: recent.length
      ? `${recent.length} error(s), latest: ${recent[0].message.slice(0, 120)}`
      : "None",
  };
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks = await Promise.all([
    databaseCheck(),
    paymentsCheck(),
    Promise.resolve(emailCheck()),
    Promise.resolve(siteUrlCheck()),
    addressCheck(),
    chatCheck(),
    recentErrorsCheck(),
  ]);
  const criticalDown = checks.some((c) => c.critical && !c.ok);
  const anyDown = checks.some((c) => !c.ok);
  return {
    status: criticalDown ? "down" : anyDown ? "degraded" : "ok",
    checked_at: new Date().toISOString(),
    checks,
  };
}
