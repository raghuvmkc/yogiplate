import { isFullDeliveryAddress } from "@/lib/geocode";
import type { Quote } from "@/lib/types";

export function escHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prettyLabel(raw?: string | null) {
  const t = String(raw || "").trim();
  if (!t) return "";
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function prettyTime(raw?: string | null) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  let h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

export function prettyDate(raw?: string | null) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const d = new Date(t.length === 10 ? `${t}T12:00:00` : t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function occasionFromNotes(notes?: string | null) {
  const m = String(notes || "").match(/Occasion:\s*([^·\n]+)/i);
  return m?.[1]?.trim() || "";
}

export function resolveOccasion(quote: Pick<Quote, "occasion" | "notes">) {
  return String(quote.occasion || "").trim() || occasionFromNotes(quote.notes);
}

/** Street address for delivery. A city name is not returned. */
export function deliveryAddressLine(
  quote: Pick<Quote, "delivery_or_pickup" | "address">
) {
  if (quote.delivery_or_pickup === "pickup") return "";
  const address = String(quote.address || "").trim();
  return isFullDeliveryAddress(address) ? address : "";
}

export function serviceLine(quote: Pick<Quote, "delivery_or_pickup" | "city" | "address">) {
  const how = prettyLabel(quote.delivery_or_pickup);
  if (quote.delivery_or_pickup === "pickup") {
    return [how, quote.city].filter(Boolean).join(" · ");
  }
  return how;
}
