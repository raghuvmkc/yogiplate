import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { CateringBooking, CateringBookingStatus } from "@/lib/types";
import type { OrderDraft } from "@/lib/chat/order-draft";
import { headcountFromDraft } from "@/lib/chat/order-draft";

export type BookingUpsertInput = {
  event_date: string;
  event_time?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  chat_session_id?: string | null;
  draft?: Partial<OrderDraft> | null;
  quote_id?: string | null;
  order_id?: string | null;
  items_summary?: string | null;
  food_subtotal?: number | null;
  /** Force status; default keeps existing or unconfirmed */
  status?: CateringBookingStatus;
};

function isIsoDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function matchKey(b: CateringBooking, input: BookingUpsertInput) {
  if (input.order_id && b.order_id === input.order_id) return true;
  if (input.quote_id && b.quote_id === input.quote_id) return true;
  if (
    input.chat_session_id &&
    b.chat_session_id === input.chat_session_id &&
    b.event_date === input.event_date
  ) {
    return true;
  }
  const email = input.customer_email.toLowerCase().trim();
  if (
    email &&
    b.customer_email.toLowerCase() === email &&
    b.event_date === input.event_date &&
    b.status !== "cancelled"
  ) {
    return true;
  }
  return false;
}

/** Upsert an unconfirmed/confirmed catering booking onto the admin calendar. */
export async function upsertCateringBooking(
  input: BookingUpsertInput
): Promise<CateringBooking | null> {
  if (!isIsoDate(input.event_date)) return null;
  const draft = input.draft || {};
  const guests =
    headcountFromDraft({
      ...({} as OrderDraft),
      adults: draft.adults ?? null,
      kids: draft.kids ?? null,
    }) || null;

  const now = new Date().toISOString();
  let saved: CateringBooking | null = null;

  await updateDb((db) => {
    if (!db.catering_bookings) db.catering_bookings = [];
    const idx = db.catering_bookings.findIndex((b) => matchKey(b, input));
    const prev = idx >= 0 ? db.catering_bookings[idx]! : null;
    const next: CateringBooking = {
      id: prev?.id || uid("cbk"),
      event_date: input.event_date,
      event_time:
        input.event_time ?? draft.event_time ?? prev?.event_time ?? null,
      status:
        input.status ||
        prev?.status ||
        (input.order_id ? "confirmed" : "unconfirmed"),
      customer_name: input.customer_name || prev?.customer_name || "",
      customer_email: input.customer_email || prev?.customer_email || "",
      customer_phone: input.customer_phone || prev?.customer_phone || "",
      occasion: draft.occasion || prev?.occasion || null,
      guest_count: guests ?? prev?.guest_count ?? null,
      diet: draft.diet || prev?.diet || null,
      meal: draft.meal || prev?.meal || null,
      delivery_or_pickup:
        draft.delivery_or_pickup || prev?.delivery_or_pickup || null,
      city: draft.city || prev?.city || null,
      address: draft.address || prev?.address || null,
      setup_needs: draft.setup_needs || prev?.setup_needs || null,
      special_requirements:
        draft.special_requirements || prev?.special_requirements || null,
      notes: draft.notes || prev?.notes || null,
      items_summary: input.items_summary ?? prev?.items_summary ?? null,
      food_subtotal: input.food_subtotal ?? prev?.food_subtotal ?? null,
      quote_id: input.quote_id ?? prev?.quote_id ?? null,
      order_id: input.order_id ?? prev?.order_id ?? null,
      chat_session_id: input.chat_session_id ?? prev?.chat_session_id ?? null,
      admin_notes: prev?.admin_notes || null,
      created_at: prev?.created_at || now,
      updated_at: now,
    };
    // Confirmed wins over unconfirmed if order/deposit present
    if (input.order_id || input.status === "confirmed") {
      next.status = "confirmed";
    }
    if (idx >= 0) db.catering_bookings[idx] = next;
    else db.catering_bookings.push(next);
    saved = next;
  });

  return saved;
}

export async function listCateringBookings(opts?: {
  from?: string;
  to?: string;
}): Promise<CateringBooking[]> {
  const db = await getDb();
  let list = [...(db.catering_bookings || [])];
  if (opts?.from) list = list.filter((b) => b.event_date >= opts.from!);
  if (opts?.to) list = list.filter((b) => b.event_date <= opts.to!);
  return list.sort((a, b) =>
    a.event_date === b.event_date
      ? (a.event_time || "").localeCompare(b.event_time || "")
      : a.event_date.localeCompare(b.event_date)
  );
}

export async function updateCateringBooking(
  id: string,
  patch: Partial<CateringBooking>
): Promise<CateringBooking | null> {
  let saved: CateringBooking | null = null;
  await updateDb((db) => {
    if (!db.catering_bookings) db.catering_bookings = [];
    const idx = db.catering_bookings.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const prev = db.catering_bookings[idx]!;
    const next: CateringBooking = {
      ...prev,
      ...patch,
      id: prev.id,
      created_at: prev.created_at,
      updated_at: new Date().toISOString(),
    };
    db.catering_bookings[idx] = next;
    saved = next;
  });
  return saved;
}

export async function getCateringBooking(id: string) {
  const db = await getDb();
  return (db.catering_bookings || []).find((b) => b.id === id) || null;
}
