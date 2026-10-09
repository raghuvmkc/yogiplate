import { getDb, updateDb } from "@/lib/store/local-db";
import type { CartLine, DietTag } from "@/lib/types";

/** Carts waiting on Stripe. Kept in the shared database because Netlify's disk is read-only. */
export interface PendingCheckout {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  diet_profile: DietTag;
  event_date: string;
  event_time?: string | null;
  guest_count: number;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_miles: number;
  items: CartLine[];
  coupon_code: string | null;
  notes: string | null;
  setup_service?: boolean;
  created_at: string;
  order_id?: string;
  order_number?: string;
  invoice_number?: string;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function savePending(pending: PendingCheckout) {
  await updateDb((db) => {
    const all = db.pending_checkouts || {};
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [id, row] of Object.entries(all)) {
      if (Date.parse(row.created_at) < cutoff) delete all[id];
    }
    all[pending.id] = pending;
    db.pending_checkouts = all;
  });
}

export async function takePending(id: string) {
  let taken: PendingCheckout | null = null;
  await updateDb((db) => {
    const all = db.pending_checkouts || {};
    taken = all[id] || null;
    if (taken) delete all[id];
    db.pending_checkouts = all;
  });
  return taken as PendingCheckout | null;
}

export async function getPending(id: string) {
  const db = await getDb();
  return db.pending_checkouts?.[id] || null;
}
