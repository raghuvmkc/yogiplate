import type { CartLine, Coupon, SiteSettings } from "@/lib/types";

/** Whole cents, so $10.10 is 1010 and not a binary float. */
/** Parse admin-entered money: "$1,200.50", "1200", "1 200" → number. */
export function parseMoneyInput(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .trim()
    .replace(/[$\s]/g, "")
    .replace(/,/g, "");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function toCents(amount: number | string): number {
  const n = parseMoneyInput(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function lineCents(unitPrice: number, quantity: number): number {
  return toCents(unitPrice) * Math.max(0, quantity);
}

export function lineTotal(unitPrice: number, quantity: number): number {
  return fromCents(lineCents(unitPrice, quantity));
}

/** Percent of a cent amount, rounded to the nearest cent. */
export function percentCents(amountCents: number, percent: number): number {
  return Math.round((amountCents * percent) / 100);
}

export function isPaidInFull(amountPaid: number, amountDue: number): boolean {
  return toCents(amountDue) > 0 && toCents(amountPaid) >= toCents(amountDue);
}

export function cartSubtotal(items: CartLine[]) {
  return fromCents(
    items.reduce(
      (sum, item) =>
        sum + lineCents(parseMoneyInput(item.price), Math.max(0, Number(item.quantity) || 0)),
      0
    )
  );
}

export function applyCoupon(subtotal: number, coupon: Coupon | null) {
  const subtotalCents = toCents(subtotal);
  if (!coupon || subtotal < coupon.min_order) return 0;
  if (coupon.type === "percent") {
    return fromCents(percentCents(subtotalCents, coupon.value));
  }
  return fromCents(Math.min(toCents(coupon.value), subtotalCents));
}

/** Cap admin percent at 0–100 and convert to dollars off the food subtotal. */
export function discountFromPercent(subtotal: number, percent: number) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return fromCents(percentCents(toCents(subtotal), p));
}

export type DeliveryFeeBreakdown = {
  /** Distance fee before any large-order discount. */
  base_fee: number;
  /** Dollars taken off for a large food subtotal. */
  delivery_discount: number;
  /** Amount charged after discount. */
  delivery_fee: number;
  large_order_discount_applied: boolean;
};

/**
 * Distance fee from kitchen:
 * flat tiers (e.g. $40 through 10 mi, $50 through 15 mi), then +rate_per_mile
 * for each mile beyond the last tier. Food subtotal above the large-order
 * threshold can take a percent off that delivery fee (default 50% over $500).
 */
export function calcDeliveryFeeBreakdown(
  miles: number,
  subtotal: number,
  settings: SiteSettings
): DeliveryFeeBreakdown {
  const distance = Math.max(0, Number(miles) || 0);
  const tiers = [...(settings.delivery_tiers || [])].sort(
    (a, b) => a.max_miles - b.max_miles
  );
  let baseCents = toCents(settings.base_delivery_fee);
  if (tiers.length) {
    const within = tiers.find((t) => distance <= t.max_miles);
    if (within) {
      baseCents = toCents(within.fee);
    } else {
      const last = tiers[tiers.length - 1]!;
      const over = Math.max(0, distance - last.max_miles);
      const billableExtra = over > 0 ? Math.ceil(over - 1e-9) : 0;
      baseCents =
        toCents(last.fee) + toCents(settings.rate_per_mile || 0) * billableExtra;
    }
  }

  const threshold = Number(settings.large_order_threshold) || 0;
  const discountPct = Math.min(
    100,
    Math.max(0, Number(settings.large_order_delivery_discount_percent) || 0)
  );
  let discountCents = 0;
  if (threshold > 0 && discountPct > 0 && subtotal > threshold) {
    discountCents = Math.round((baseCents * discountPct) / 100);
  }
  return {
    base_fee: fromCents(baseCents),
    delivery_discount: fromCents(discountCents),
    delivery_fee: fromCents(baseCents - discountCents),
    large_order_discount_applied: discountCents > 0,
  };
}

export function calcDeliveryFee(
  miles: number,
  subtotal: number,
  settings: SiteSettings
) {
  return calcDeliveryFeeBreakdown(miles, subtotal, settings).delivery_fee;
}

/** Short guest/admin blurb for the current delivery policy. */
export function deliveryPricingBlurb(settings: SiteSettings) {
  const tiers = [...(settings.delivery_tiers || [])].sort(
    (a, b) => a.max_miles - b.max_miles
  );
  const tierText = tiers.length
    ? tiers.map((t) => `${formatMoney(t.fee)} until ${t.max_miles} mi`).join(", ")
    : `${formatMoney(settings.base_delivery_fee)} base`;
  const perMile = settings.rate_per_mile || 0;
  const beyond =
    perMile > 0 && tiers.length
      ? `; then ${formatMoney(perMile)} per mile after ${tiers[tiers.length - 1]!.max_miles} mi`
      : "";
  const threshold = settings.large_order_threshold || 0;
  const pct = settings.large_order_delivery_discount_percent || 0;
  const large =
    threshold > 0 && pct > 0
      ? ` Food over ${formatMoney(threshold)} (before tax) gets ${pct}% off delivery.`
      : "";
  return `${tierText}${beyond}.${large} Pickup is free.`;
}

export function calcTax(amount: number, settings: SiteSettings) {
  return fromCents(Math.round(toCents(amount) * settings.tax_rate));
}

export function chargeTotals(input: {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  setupFee?: number;
  taxRate: number;
}) {
  const subtotalCents = toCents(input.subtotal);
  const discountCents = Math.min(toCents(input.discount), subtotalCents);
  const deliveryCents = toCents(input.deliveryFee);
  const setupCents = toCents(input.setupFee || 0);
  const taxableCents = Math.max(
    0,
    subtotalCents - discountCents + deliveryCents + setupCents
  );
  const taxCents = Math.round(taxableCents * input.taxRate);
  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    delivery_fee: fromCents(deliveryCents),
    setup_fee: fromCents(setupCents),
    tax: fromCents(taxCents),
    total: fromCents(taxableCents + taxCents),
  };
}

export const DEFAULT_SETUP_FEE = 200;

/** On-site buffet setup charge; only applies to delivery orders. */
export function setupFeeFor(settings: SiteSettings, wanted: boolean | undefined) {
  return wanted ? settings.setup_fee ?? DEFAULT_SETUP_FEE : 0;
}

/** Calendar note so the kitchen sees setup was booked. */
export function setupNeedsLabel(fee: number) {
  return `Full on-site setup requested (${formatMoney(fee)})`;
}

export function calcOrderTotals(input: {
  items: CartLine[];
  miles: number;
  coupon: Coupon | null;
  settings: SiteSettings;
  setup?: boolean;
}) {
  const subtotal = cartSubtotal(input.items);
  const discount = applyCoupon(subtotal, input.coupon);
  const delivery_fee = calcDeliveryFee(input.miles, subtotal, input.settings);
  return chargeTotals({
    subtotal,
    discount,
    deliveryFee: delivery_fee,
    setupFee: setupFeeFor(input.settings, input.setup),
    taxRate: input.settings.tax_rate,
  });
}

export function round2(n: number) {
  return fromCents(toCents(n));
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
