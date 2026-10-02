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
  /** Planning tags (optional overrides; otherwise derived from diet_tags / copy). */
  allergens?: string[];
  jain_ok?: boolean;
  vegan_ok?: boolean;
  no_onion_garlic_ok?: boolean;
  gluten_status?:
    | "unknown"
    | "contains_gluten"
    | "may_contain"
    | "gluten_free_option";
  spice_level?: "mild" | "medium" | "hot" | "unknown";
  kid_friendly?: boolean;
  max_hold_minutes?: number | null;
  holds_well?: boolean;
  best_served?: "hot" | "room" | "cold" | "either";
}

export type ContactChannel =
  | "web_chat"
  | "whatsapp"
  | "sms"
  | "email"
  | "phone"
  | "ezcater"
  | "other";

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
  /** How they first reached Yogiplate. */
  source_channel?: ContactChannel | null;
  last_channel?: ContactChannel | null;
  last_contact_at?: string | null;
  tags?: string[];
  crm_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteStatus =
  | "draft"
  | "sent"
  | "deposit_paid"
  | "accepted"
  | "expired"
  | "cancelled";

export interface QuoteLine {
  menu_item_id: string;
  variant_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  unit: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  customer_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  diet_profile: string;
  event_date: string;
  event_time?: string | null;
  guest_count: number;
  occasion?: string | null;
  meal?: string | null;
  delivery_or_pickup?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  setup_needs?: string | null;
  special_requirements?: string | null;
  /** Closing wish printed at the end of the quotation. */
  closing_message?: string | null;
  items: QuoteLine[];
  food_subtotal: number;
  estimated_total: number;
  deposit_percent: number;
  deposit_amount: number;
  deposit_paid_at?: string | null;
  stripe_deposit_session_id?: string | null;
  public_token: string;
  chat_session_id?: string | null;
  channel?: ContactChannel | null;
  email_sent_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type ReminderKind =
  | "day_before_event"
  | "quote_followup"
  | "post_event_review";

export type ReminderStatus = "pending" | "sent" | "cancelled" | "failed";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  status: ReminderStatus;
  due_at: string;
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
  quote_id?: string | null;
  order_id?: string | null;
  event_date?: string | null;
  sent_at?: string | null;
  error?: string | null;
  created_at: string;
}

export interface ChatSessionLog {
  id: string;
  started_at: string;
  updated_at: string;
  channel: ContactChannel;
  lead_name?: string | null;
  lead_email?: string | null;
  lead_phone?: string | null;
  turn_count: number;
  tools_used: string[];
  skills_used: string[];
  offered_whatsapp: boolean;
  cart_proposals: number;
  quotes_created: number;
  converted: boolean;
  outcome?:
    | "browsing"
    | "quote"
    | "cart"
    | "escalated"
    | "ordered"
    | null;
}

export interface ChannelMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  meta?: Record<string, unknown> | null;
}

export interface ChannelThread {
  id: string;
  channel: ContactChannel;
  external_id: string;
  customer_id?: string | null;
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  messages: ChannelMessage[];
  status: "open" | "closed";
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
  /** Deposit percent for catering quotes (default 30). */
  deposit_percent?: number;
  /** Quote validity in days (default 7). */
  quote_validity_days?: number;
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

/** Admin catering calendar entry from chat / quotes / orders. */
export type CateringBookingStatus =
  | "unconfirmed"
  | "confirmed"
  | "cancelled";

export interface CateringBooking {
  id: string;
  event_date: string; // YYYY-MM-DD
  event_time?: string | null;
  status: CateringBookingStatus;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  occasion?: string | null;
  guest_count?: number | null;
  diet?: string | null;
  meal?: string | null;
  delivery_or_pickup?: string | null;
  city?: string | null;
  address?: string | null;
  setup_needs?: string | null;
  special_requirements?: string | null;
  notes?: string | null;
  items_summary?: string | null;
  food_subtotal?: number | null;
  quote_id?: string | null;
  order_id?: string | null;
  chat_session_id?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartState {
  diet: DietTag | null;
  guestCount: number;
  eventDate: string;
  notes: string;
  items: CartLine[];
  couponCode: string;
}
