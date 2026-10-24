/**
 * Delivery fee tiers + large-order discount.
 * Run: npx tsx src/lib/pricing-delivery.test.ts
 */
import assert from "node:assert/strict";
import { calcDeliveryFeeBreakdown } from "@/lib/pricing";
import type { SiteSettings } from "@/lib/types";

const settings = {
  base_delivery_fee: 40,
  rate_per_mile: 2,
  delivery_tiers: [
    { max_miles: 10, fee: 40 },
    { max_miles: 15, fee: 50 },
  ],
  large_order_threshold: 500,
  large_order_delivery_discount_percent: 50,
  tax_rate: 0.1,
} as SiteSettings;

assert.equal(calcDeliveryFeeBreakdown(5, 100, settings).delivery_fee, 40);
assert.equal(calcDeliveryFeeBreakdown(10, 100, settings).delivery_fee, 40);
assert.equal(calcDeliveryFeeBreakdown(12, 100, settings).delivery_fee, 50);
assert.equal(calcDeliveryFeeBreakdown(15, 100, settings).delivery_fee, 50);
assert.equal(calcDeliveryFeeBreakdown(16, 100, settings).delivery_fee, 52);
assert.equal(calcDeliveryFeeBreakdown(20, 100, settings).delivery_fee, 60);

const discounted = calcDeliveryFeeBreakdown(12, 501, settings);
assert.equal(discounted.base_fee, 50);
assert.equal(discounted.delivery_discount, 25);
assert.equal(discounted.delivery_fee, 25);
assert.equal(discounted.large_order_discount_applied, true);

assert.equal(
  calcDeliveryFeeBreakdown(12, 500, settings).large_order_discount_applied,
  false,
  "exactly $500 food does not get the discount (must be over $500)"
);

console.log("pricing-delivery.test.ts: ok");
