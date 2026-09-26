export type DietTag =
  | "jain"
  | "swaminarayan"
  | "pushtimarg"
  | "pure_vegetarian"
  | "vegan"
  | "italian";

export type OrderStatus =
  | "pending"
  | "paid"
  | "preparing"
  | "delivered"
  | "cancelled";

export type CouponType = "percent" | "fixed";

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface MenuVariant {
  id: string;
  label: string;
  price: number;
  unit?: string;
  /** How many guests this tray size feeds (from YogiplateKT CateringPricing). */
  serves?: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  diet_tags: DietTag[];
  is_available: boolean;
  image?: string;
  image_hint?: string;
  notes?: string;
  min_quantity?: number;
  /** Tray or pizza size options; when present, cart lines use a selected variant. */
  variants?: MenuVariant[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
}

export interface CartLine {
  menu_item_id: string;
  /** Stable cart key: menu id, or menu id + variant id. */
  line_id: string;
  variant_id?: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  diet_profile: DietTag;
  event_date: string;
  guest_count: number;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_miles: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  status: OrderStatus;
  stripe_session_id: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  html: string;
  email_sent_at: string | null;
  created_at: string;
}

export interface SiteSettings {
  kitchen_address: string;
  kitchen_lat: number;
  kitchen_lng: number;
  base_delivery_fee: number;
  rate_per_mile: number;
  free_delivery_threshold: number;
  tax_rate: number;
  service_radius_miles: number;
  business_name: string;
  business_email: string;
  business_phone: string;
  /** Minimum hours before event for catering (default 48). */
  lead_time_hours?: number;
  /** Soft daily guest capacity for calendar checks (default 200). */
  max_guests_per_day?: number;
  /** Soft hold TTL in minutes (default 120). */
  hold_ttl_minutes?: number;
}

export type CalendarBlockKind = "order" | "hold" | "blocked" | "blackout";

export interface CalendarBlock {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  kind: CalendarBlockKind;
  guest_count: number;
  order_id?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  notes?: string | null;
  status: "active" | "released" | "expired";
  expires_at?: string | null;
  created_at: string;
}

export interface CartState {
  diet: DietTag | null;
  guestCount: number;
  eventDate: string;
  notes: string;
  items: CartLine[];
  couponCode: string;
}
