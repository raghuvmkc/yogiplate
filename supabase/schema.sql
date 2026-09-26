-- Yogiplate Catering — Supabase schema
-- Run in Supabase SQL editor when migrating from local JSON store.

create extension if not exists "pgcrypto";

create type diet_tag as enum (
  'jain',
  'swaminarayan',
  'pushtimarg',
  'pure_vegetarian',
  'vegan',
  'italian'
);

create type order_status as enum (
  'pending',
  'paid',
  'preparing',
  'delivered',
  'cancelled'
);

create type coupon_type as enum ('percent', 'fixed');

create table menu_categories (
  id text primary key,
  name text not null,
  sort_order int not null default 0
);

create table menu_items (
  id text primary key,
  category_id text references menu_categories(id) on delete set null,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null,
  unit text not null default 'each',
  diet_tags diet_tag[] not null default '{}',
  is_available boolean not null default true,
  notes text,
  min_quantity int,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null default '',
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table coupons (
  id text primary key,
  code text not null unique,
  type coupon_type not null,
  value numeric(10,2) not null,
  min_order numeric(10,2) not null default 0,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true
);

create table orders (
  id text primary key,
  order_number text not null unique,
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  diet_profile diet_tag not null,
  event_date date not null,
  guest_count int not null default 0,
  delivery_address text not null,
  delivery_city text not null,
  delivery_state text not null,
  delivery_zip text not null,
  delivery_miles numeric(8,1) not null default 0,
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  tax numeric(10,2) not null,
  total numeric(10,2) not null,
  coupon_code text,
  status order_status not null default 'pending',
  stripe_session_id text,
  notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table order_items (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  menu_item_id text,
  name text not null,
  unit_price numeric(10,2) not null,
  quantity int not null,
  line_total numeric(10,2) not null
);

create table invoices (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  invoice_number text not null unique,
  html text not null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  kitchen_address text not null,
  kitchen_lat double precision not null,
  kitchen_lng double precision not null,
  base_delivery_fee numeric(10,2) not null default 15,
  rate_per_mile numeric(10,2) not null default 2.5,
  free_delivery_threshold numeric(10,2) not null default 250,
  tax_rate numeric(8,4) not null default 0.0975,
  service_radius_miles numeric(8,1) not null default 50,
  business_name text not null default 'Yogiplate Catering',
  business_email text not null,
  business_phone text not null
);

alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table customers enable row level security;
alter table coupons enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table invoices enable row level security;
alter table settings enable row level security;

-- Public read menus
create policy "Public read categories" on menu_categories for select using (true);
create policy "Public read menu items" on menu_items for select using (true);
create policy "Public read active coupons for validate" on coupons for select using (is_active = true);
create policy "Public read settings" on settings for select using (true);

-- Admin writes via service role (bypasses RLS) from Next.js API routes.
-- Authenticated admin role can be added later with auth.users + is_admin claim.

insert into settings (
  kitchen_address, kitchen_lat, kitchen_lng, business_email, business_phone
) values (
  'Fremont, CA 94538', 37.5485, -121.9886, 'orders@yogiplate.com', '(510) 555-0199'
) on conflict (id) do nothing;
