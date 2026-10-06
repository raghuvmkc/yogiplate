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

export function calcDeliveryFee(
  miles: number,
  subtotal: number,
  settings: SiteSettings
) {
  if (subtotal >= settings.free_delivery_threshold) return 0;
  const distanceCents = Math.round(miles * toCents(settings.rate_per_mile));
  return fromCents(Math.max(toCents(settings.base_delivery_fee), distanceCents));
}

export function calcTax(amount: number, settings: SiteSettings) {
  return fromCents(Math.round(toCents(amount) * settings.tax_rate));
}

export function chargeTotals(input: {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  taxRate: number;
}) {
  const subtotalCents = toCents(input.subtotal);
  const discountCents = Math.min(toCents(input.discount), subtotalCents);
  const deliveryCents = toCents(input.deliveryFee);
  const taxableCents = Math.max(0, subtotalCents - discountCents + deliveryCents);
  const taxCents = Math.round(taxableCents * input.taxRate);
  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    delivery_fee: fromCents(deliveryCents),
    tax: fromCents(taxCents),
    total: fromCents(taxableCents + taxCents),
  };
}

export function calcOrderTotals(input: {
  items: CartLine[];
  miles: number;
  coupon: Coupon | null;
  settings: SiteSettings;
}) {
  const subtotal = cartSubtotal(input.items);
  const discount = applyCoupon(subtotal, input.coupon);
  const delivery_fee = calcDeliveryFee(input.miles, subtotal, input.settings);
  return chargeTotals({
    subtotal,
    discount,
    deliveryFee: delivery_fee,
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
