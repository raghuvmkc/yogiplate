import type { MenuCategory, MenuItem } from "@/lib/types";
import catalog from "@/lib/data/catering-catalog.json";

export {
  DIET_BLURBS,
  DIET_DETAILS,
  DIET_LABELS,
  PRIMARY_DIETS,
} from "@/lib/data/diet-profiles";

export const MENU_SEED_VERSION = catalog.seedVersion;

export const categories = catalog.categories as MenuCategory[];
export const menuItems = catalog.items as MenuItem[];

export const DELIVERY_POLICY_VERSION = 2;

/** Store address and delivery pricing; re-applied to saved settings when the version changes. */
export const deliveryPolicyDefaults = {
  kitchen_address: "326 Commercial St, San Jose, CA 95112",
  kitchen_lat: 37.3607951,
  kitchen_lng: -121.8992863,
  base_delivery_fee: 49,
  rate_per_mile: 0,
  free_delivery_threshold: 0,
  service_radius_miles: 25,
  delivery_tiers: [
    { max_miles: 8, fee: 49 },
    { max_miles: 15, fee: 79 },
    { max_miles: 25, fee: 109 },
  ],
  large_order_threshold: 600,
  large_order_extra: 15,
  delivery_policy_version: DELIVERY_POLICY_VERSION,
};

export const defaultSettings = {
  ...deliveryPolicyDefaults,
  setup_fee: 200,
  tax_rate: 0.0975,
  business_name: "Yogiplate Catering",
  business_email: "orders@yogiplate.com",
  business_phone: "(510) 555-0199",
  lead_time_hours: 48,
  max_guests_per_day: 200,
  hold_ttl_minutes: 120,
};

export const defaultCoupons = [
  {
    id: "coupon-welcome10",
    code: "WELCOME10",
    type: "percent" as const,
    value: 10,
    min_order: 75,
    max_uses: 500,
    used_count: 0,
    expires_at: null,
    is_active: true,
  },
  {
    id: "coupon-bay25",
    code: "BAY25",
    type: "fixed" as const,
    value: 25,
    min_order: 150,
    max_uses: 200,
    used_count: 0,
    expires_at: null,
    is_active: true,
  },
];
