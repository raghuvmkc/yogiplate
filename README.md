# Yogiplate Catering

Pure-white Bay Area vegetarian catering site with online order builder, distance-based delivery pricing, coupons, Stripe payments, automatic invoices, customer storage, and an admin panel.

Supports **Jain**, **Swaminarayan**, **Pushtimarg**, **Vegan**, and **Italian** menus — cooked with pure, fresh ingredients.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill keys as needed. The app works in **demo mode** without Stripe/Resend/Maps/Supabase — orders persist under `.data/`.

### Demo admin

- URL: `/admin/login`
- Email: `admin@yogiplate.com`
- Password: `yogiplate-admin`

### Demo coupons

- `WELCOME10` — 10% off orders $75+
- `BAY25` — $25 off orders $150+

## Features

- Dietary-first order builder (hard filters by tradition)
- Delivery quote by distance from Fremont kitchen (Google Distance Matrix or Bay Area city fallback)
- Coupon validation
- Stripe Checkout + webhook (+ success-page confirm fallback)
- Auto invoice HTML + Resend email
- Admin: orders, customers, menus, coupons, delivery settings

## Supabase

1. Create a Supabase project
2. Run [`supabase/schema.sql`](supabase/schema.sql) then [`supabase/seed.sql`](supabase/seed.sql) in the SQL editor
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`

The app always keeps a local JSON store (`.data/db.json`) so you can develop offline. When Supabase is configured, menus/settings/coupons prefer remote reads and fulfilled orders sync to Supabase automatically.

## Deploy (Vercel)

```bash
npm run build
```

Connect the repo to Vercel, set the same env vars as `.env.example`, and point Stripe webhooks to `/api/webhooks/stripe`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
