/**
 * Uber Direct (eats.deliveries) — same API Surface as Stone Craft Pizza.
 * Quote → create delivery → cancel / refresh status.
 */

import { serverEnv } from "@/lib/server-env";

const AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com/v1";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export type UberAddressParts = {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
};

export type UberDeliveryWindow = {
  pickup_ready_dt: string;
  pickup_deadline_dt: string;
  dropoff_ready_dt: string;
  dropoff_deadline_dt: string;
};

export type UberDeliveryInfo = {
  courier: "uber";
  quote_id: string;
  delivery_id: string;
  support_reference: string;
  status: string;
  tracking_url: string;
  fee_cents: number | null;
  pickup_eta: string | null;
  dropoff_eta: string | null;
  /** Admin-chosen kitchen pickup ready time (UTC ISO). */
  pickup_ready_dt?: string | null;
  /** Pacific civil date YYYY-MM-DD the admin set. */
  pickup_local_date?: string | null;
  /** Pacific HH:mm the admin set. */
  pickup_local_time?: string | null;
  scheduled_at: string;
  cancelled_at?: string | null;
};

export function uberConfigured(): boolean {
  return Boolean(
    serverEnv("UBER_DIRECT_CLIENT_ID") &&
      serverEnv("UBER_DIRECT_CLIENT_SECRET") &&
      serverEnv("UBER_DIRECT_CUSTOMER_ID")
  );
}

function requireEnv(name: string) {
  const value = serverEnv(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function customerId() {
  return requireEnv("UBER_DIRECT_CUSTOMER_ID");
}

export function pickupName() {
  return serverEnv("UBER_PICKUP_NAME") || "Yogiplate";
}

export function pickupPhone() {
  return (
    serverEnv("UBER_PICKUP_PHONE") ||
    serverEnv("MANAGER_PHONE_E164") ||
    "+14083354055"
  );
}

/** Parse "326 Commercial Street, San Jose, CA 95112" style strings. */
export function parseUsAddress(raw: string): UberAddressParts | null {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const m = text.match(
    /^(.+?)(?:,\s*|\s+)([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:\s*,?\s*USA?)?$/i
  );
  if (m) {
    return {
      street: m[1].trim(),
      city: m[2].trim(),
      state: m[3].toUpperCase(),
      zip: m[4],
      country: "US",
    };
  }
  const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  const state = text.match(/\b([A-Z]{2})\s+\d{5}\b/i)?.[1]?.toUpperCase();
  if (!zip) return null;
  const withoutZip = text
    .replace(/,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i, "")
    .replace(/,?\s*USA?$/i, "")
    .trim();
  const parts = withoutZip.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      street: parts.slice(0, -1).join(", "),
      city: parts[parts.length - 1],
      state: state || "CA",
      zip,
      country: "US",
    };
  }
  return null;
}

export function pickupAddressParts(): UberAddressParts {
  const fromEnv = parseUsAddress(serverEnv("UBER_PICKUP_ADDRESS"));
  if (fromEnv) return fromEnv;
  // Same kitchen as Stone Craft when env is unset.
  return {
    street: "326 Commercial Street",
    city: "San Jose",
    state: "CA",
    zip: "95112",
    country: "US",
  };
}

export function formatUberAddress(parts: UberAddressParts): string {
  const streets = [parts.street];
  if (parts.street2?.trim()) streets.push(parts.street2.trim());
  return JSON.stringify({
    street_address: streets,
    city: parts.city,
    state: parts.state || "CA",
    zip_code: parts.zip,
    country: parts.country || "US",
  });
}

export function extractZip(text: string): string | null {
  return String(text || "").match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || null;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (tokenCache && now < tokenCache.expiresAt - 60) {
    return tokenCache.token;
  }
  const body = new URLSearchParams({
    client_id: requireEnv("UBER_DIRECT_CLIENT_ID"),
    client_secret: requireEnv("UBER_DIRECT_CLIENT_SECRET"),
    grant_type: "client_credentials",
    scope: "eats.deliveries",
  });
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Uber auth failed (${res.status})`
    );
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
  };
  return data.access_token;
}

async function uberFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      text.slice(0, 400) ||
      `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return json;
}

/** Build Uber pickup/dropoff windows from a Pacific kitchen pickup-ready instant. */
export function buildUberWindow(pickupReadyIso: string): UberDeliveryWindow {
  const ready = new Date(pickupReadyIso).getTime();
  if (!Number.isFinite(ready)) {
    throw new Error("Invalid pickup ready time.");
  }
  const now = Date.now();
  // Scheduled deliveries need enough lead time for Uber to assign a courier.
  if (ready < now + 20 * 60 * 1000) {
    throw new Error(
      "Pickup time must be at least 20 minutes from now (Pacific). Pick a later time."
    );
  }
  const addMin = (ms: number, minutes: number) =>
    new Date(ms + minutes * 60 * 1000).toISOString();
  // Windows-style schedule: ready → 45 min pickup window; dropoff through +2 hours.
  return {
    pickup_ready_dt: new Date(ready).toISOString(),
    pickup_deadline_dt: addMin(ready, 45),
    dropoff_ready_dt: addMin(ready, 15),
    dropoff_deadline_dt: addMin(ready, 120),
  };
}

export async function createUberQuote(
  pickup: UberAddressParts,
  dropoff: UberAddressParts,
  window?: UberDeliveryWindow | null
) {
  return uberFetch(`/customers/${customerId()}/delivery_quotes`, {
    method: "POST",
    body: JSON.stringify({
      pickup_address: formatUberAddress(pickup),
      dropoff_address: formatUberAddress(dropoff),
      ...(window || {}),
    }),
  });
}

export async function createUberDelivery(payload: Record<string, unknown>) {
  return uberFetch(`/customers/${customerId()}/deliveries`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelUberDelivery(deliveryId: string) {
  return uberFetch(`/customers/${customerId()}/deliveries/${deliveryId}/cancel`, {
    method: "POST",
    body: "{}",
  });
}

export async function getUberDelivery(deliveryId: string) {
  return uberFetch(`/customers/${customerId()}/deliveries/${deliveryId}`, {
    method: "GET",
  });
}

export function trackingFromUber(delivery: Record<string, unknown>): string {
  for (const key of ["tracking_url", "trackingUrl", "order_tracking_url"] as const) {
    const value = String(delivery[key] || "").trim();
    if (value) return value;
  }
  return "";
}

export function mapUberDelivery(
  delivery: Record<string, unknown>,
  quoteId: string,
  feeCents: number | null,
  extras?: {
    pickup_ready_dt?: string | null;
    pickup_local_date?: string | null;
    pickup_local_time?: string | null;
  }
): UberDeliveryInfo {
  return {
    courier: "uber",
    quote_id: quoteId,
    delivery_id: String(delivery.id || ""),
    support_reference: String(delivery.id || ""),
    status: String(delivery.status || ""),
    tracking_url: trackingFromUber(delivery),
    fee_cents: feeCents,
    pickup_eta: String(
      delivery.pickup_ready || delivery.pickup_eta || delivery.pickup_deadline || ""
    ) || null,
    dropoff_eta: String(
      delivery.dropoff_eta || delivery.dropoff_deadline || ""
    ) || null,
    pickup_ready_dt: extras?.pickup_ready_dt || null,
    pickup_local_date: extras?.pickup_local_date || null,
    pickup_local_time: extras?.pickup_local_time || null,
    scheduled_at: new Date().toISOString(),
  };
}

export function uberIsTerminal(status: string): boolean {
  const s = status.toLowerCase();
  return ["delivered", "canceled", "cancelled", "returned", "failed"].includes(s);
}
