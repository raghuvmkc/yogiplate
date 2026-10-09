import type { CartLine, Coupon, SiteSettings } from "@/lib/types";

/** Whole cents, so $10.10 is 1010 and not a binary float. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
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
  return fromCents(items.reduce((sum, item) => sum + lineCents(item.price, item.quantity), 0));
}

export function applyCoupon(subtotal: number, coupon: Coupon | null) {
  const subtotalCents = toCents(subtotal);
  if (!coupon || subtotal < coupon.min_order) return 0;
  if (coupon.type === "percent") {
    return fromCents(percentCents(subtotalCents, coupon.value));
  }
  return fromCents(Math.min(toCents(coupon.value), subtotalCents));
}

/** Distance tier fee (under 8 mi, 8–15, 15–25 by default), plus the large-order extra. */
export function calcDeliveryFee(
  miles: number,
  subtotal: number,
  settings: SiteSettings
) {
  const tiers = [...(settings.delivery_tiers || [])].sort(
    (a, b) => a.max_miles - b.max_miles
  );
  let feeCents = toCents(settings.base_delivery_fee);
  if (tiers.length) {
    const tier =
      tiers.find((t) => miles < t.max_miles) || tiers[tiers.length - 1];
    feeCents = toCents(tier.fee);
  }
  if (
    settings.large_order_threshold &&
    settings.large_order_extra &&
    subtotal > settings.large_order_threshold
  ) {
    feeCents += toCents(settings.large_order_extra);
  }
  return fromCents(feeCents);
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
