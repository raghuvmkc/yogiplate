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

export const defaultSettings = {
  kitchen_address: "Fremont, CA 94538",
  kitchen_lat: 37.5485,
  kitchen_lng: -121.9886,
  base_delivery_fee: 15,
  rate_per_mile: 2.5,
  free_delivery_threshold: 250,
  tax_rate: 0.0975,
  service_radius_miles: 50,
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
