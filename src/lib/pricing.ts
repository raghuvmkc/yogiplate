import type { CartLine, Coupon, SiteSettings } from "@/lib/types";

export function cartSubtotal(items: CartLine[]) {
  return round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
}

export function applyCoupon(subtotal: number, coupon: Coupon | null) {
  if (!coupon) return 0;
  if (subtotal < coupon.min_order) return 0;
  if (coupon.type === "percent") {
    return round2((subtotal * coupon.value) / 100);
  }
  return round2(Math.min(coupon.value, subtotal));
}

export function calcDeliveryFee(
  miles: number,
  subtotal: number,
  settings: SiteSettings
) {
  if (subtotal >= settings.free_delivery_threshold) return 0;
  const distanceFee = miles * settings.rate_per_mile;
  return round2(Math.max(settings.base_delivery_fee, distanceFee));
}

export function calcTax(amount: number, settings: SiteSettings) {
  return round2(amount * settings.tax_rate);
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
  const taxable = Math.max(0, subtotal - discount + delivery_fee);
  const tax = calcTax(taxable, input.settings);
  const total = round2(taxable + tax);
  return { subtotal, discount, delivery_fee, tax, total };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
