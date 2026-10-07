import { getDb, uid, updateDb } from "@/lib/store/local-db";
import { fromCents, isPaidInFull, round2, toCents } from "@/lib/pricing";
import type {
  CateringBooking,
  CateringBookingStatus,
  Order,
  PaymentRecord,
} from "@/lib/types";
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
  quote_number?: string | null;
  order_number?: string | null;
  invoice_number?: string | null;
  amount_due?: number | null;
  /** Append one payment. The same Stripe session is recorded once. */
  payment?: {
    amount: number;
    stripe_session_id?: string | null;
    paid_at?: string | null;
    note?: string | null;
  } | null;
  /** Force status; default keeps existing or unconfirmed. Money overrides this. */
  status?: CateringBookingStatus;
};

const STATUS_RANK: Record<CateringBookingStatus, number> = {
  unconfirmed: 0,
  quote_sent: 1,
  order_placed: 2,
  invoice_sent: 3,
  confirmed: 4,
  partial: 5,
  paid: 6,
  cancelled: 7,
};

export function appendPaymentRecord(
  existing: PaymentRecord[] | undefined,
  payment?: BookingUpsertInput["payment"]
): PaymentRecord[] {
  const list = [...(existing || [])];
  if (!payment || !(payment.amount > 0)) return list;
  const sid = payment.stripe_session_id?.trim() || "";
  if (sid && list.some((row) => row.stripe_session_id === sid)) return list;
  list.push({
    id: uid("pay"),
    amount: round2(payment.amount),
    paid_at: payment.paid_at || new Date().toISOString(),
    stripe_session_id: sid || null,
    note: payment.note || null,
  });
  return list;
}

function preferStatus(
  prev: CateringBookingStatus | undefined,
  next: CateringBookingStatus
): CateringBookingStatus {
  if (next === "cancelled") return "cancelled";
  if (!prev || prev === "cancelled") return next;
  return (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[prev] ?? 0) ? next : prev;
}

function statusFromMoney(
  prev: CateringBookingStatus | undefined,
  requested: CateringBookingStatus | undefined,
  amountPaid: number,
  amountDue: number | null
): CateringBookingStatus {
  if (requested === "cancelled") return "cancelled";
  if (amountDue != null && isPaidInFull(amountPaid, amountDue)) return "paid";
  if (toCents(amountPaid) > 0) return "partial";
  return preferStatus(prev, requested || prev || "unconfirmed");
}

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
  const email = (input.customer_email || "").toLowerCase().trim();
  if (
    email &&
    (b.customer_email || "").toLowerCase() === email &&
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
    const payments = appendPaymentRecord(prev?.payments, input.payment);
    const amount_paid = payments.length
      ? fromCents(payments.reduce((sum, row) => sum + toCents(row.amount), 0))
      : (prev?.amount_paid ?? 0);
    const amount_due = input.amount_due ?? prev?.amount_due ?? null;
    const next: CateringBooking = {
      id: prev?.id || uid("cbk"),
      event_date: input.event_date,
      event_time:
        input.event_time || draft.event_time || prev?.event_time || null,
      status: statusFromMoney(prev?.status, input.status, amount_paid, amount_due),
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
      quote_number: input.quote_number ?? prev?.quote_number ?? null,
      order_id: input.order_id ?? prev?.order_id ?? null,
      order_number: input.order_number ?? prev?.order_number ?? null,
      invoice_number: input.invoice_number ?? prev?.invoice_number ?? null,
      amount_due,
      amount_paid,
      payments,
      chat_session_id: input.chat_session_id ?? prev?.chat_session_id ?? null,
      admin_notes: prev?.admin_notes || null,
      created_at: prev?.created_at || now,
      updated_at: now,
    };
    // Confirmed wins over unconfirmed if order/deposit present
    if (idx >= 0) db.catering_bookings[idx] = next;
    else db.catering_bookings.push(next);
    saved = next;
  });

  return saved;
}

function dateQuery(q: string) {
  const iso = q.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return q;
  const us = q.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return null;
  return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
}

function bookingMatches(b: CateringBooking, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const fields = [
    b.customer_name,
    b.order_id,
    b.order_number,
    b.quote_id,
    b.quote_number,
    b.invoice_number,
    b.event_date,
  ];
  if (fields.some((value) => String(value || "").toLowerCase().includes(needle))) {
    return true;
  }
  const date = dateQuery(needle);
  return Boolean(date && b.event_date === date);
}

function collected(order: Order) {
  if (order.payments?.length) {
    return fromCents(order.payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  }
  if (order.amount_paid != null && order.amount_paid > 0) return order.amount_paid;
  if (order.status === "paid") return order.total;
  return 0;
}

/** Paint quotes and invoices already on file onto the calendar. */
async function syncDocumentsOntoCalendar() {
  const db = await getDb();
  const quotes = db.quotes || [];
  const covered = new Set(
    quotes.map((quote) => quote.order_id).filter((id): id is string => Boolean(id))
  );

  for (const quote of quotes) {
    if (!isIsoDate(quote.event_date || "")) continue;
    if (
      quote.status !== "sent" &&
      quote.status !== "deposit_paid" &&
      quote.status !== "accepted"
    ) {
      continue;
    }
    const order = quote.order_id
      ? db.orders.find((row) => row.id === quote.order_id)
      : undefined;
    const invoice = order
      ? db.invoices.find((row) => row.order_id === order.id)
      : undefined;
    await paintDocument({
      event_date: quote.event_date,
      event_time: quote.event_time,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      chat_session_id: quote.chat_session_id,
      quote_id: quote.id,
      quote_number: quote.quote_number,
      order,
      invoice_number: invoice?.invoice_number,
      amount_due: order?.total || quote.estimated_total,
      document: invoice?.email_sent_at ? "invoice_sent" : "quote_sent",
      items_summary: quote.items.map((item) => `${item.quantity}× ${item.name}`).join("; "),
      food_subtotal: quote.food_subtotal,
    });
  }

  for (const invoice of db.invoices) {
    const order = db.orders.find((row) => row.id === invoice.order_id);
    if (!order || !isIsoDate(order.event_date) || covered.has(order.id)) continue;
    await paintDocument({
      event_date: order.event_date,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      order,
      invoice_number: invoice.invoice_number,
      amount_due: order.total,
      document: "invoice_sent",
      items_summary: null,
      food_subtotal: order.subtotal,
    });
  }
}

async function paintDocument(input: {
  event_date: string;
  event_time?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  chat_session_id?: string | null;
  quote_id?: string | null;
  quote_number?: string | null;
  order?: Order;
  invoice_number?: string | null;
  amount_due: number;
  document: "quote_sent" | "invoice_sent";
  items_summary: string | null;
  food_subtotal: number | null;
}) {
  const paid = input.order ? collected(input.order) : 0;
  const db = await getDb();
  const existing = (db.catering_bookings || []).find(
    (row) =>
      (input.quote_id && row.quote_id === input.quote_id) ||
      (input.order && row.order_id === input.order.id)
  );
  if (existing?.status === "cancelled") return;
  const want = statusFromMoney(
    existing?.status,
    input.document,
    paid,
    input.amount_due
  );
  const sameMoney = toCents(existing?.amount_paid || 0) === toCents(paid);
  if (
    existing &&
    existing.status === want &&
    sameMoney &&
    existing.order_number === (input.order?.order_number || existing.order_number)
  ) {
    return;
  }

  const base = {
    event_date: input.event_date,
    event_time: input.event_time,
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    customer_phone: input.customer_phone,
    chat_session_id: input.chat_session_id,
    quote_id: input.quote_id,
    quote_number: input.quote_number,
    order_id: input.order?.id,
    order_number: input.order?.order_number,
    invoice_number: input.invoice_number,
    amount_due: input.amount_due,
    items_summary: input.items_summary,
    food_subtotal: input.food_subtotal,
    status: input.document,
  };

  const recorded = input.order?.payments?.filter((row) => row.amount > 0) || [];
  if (recorded.length) {
    for (const payment of recorded) {
      await upsertCateringBooking({
        ...base,
        payment: {
          amount: payment.amount,
          stripe_session_id: payment.stripe_session_id,
          paid_at: payment.paid_at,
          note: payment.note,
        },
      });
    }
    return;
  }

  if (paid > 0) {
    await upsertCateringBooking({
      ...base,
      payment: {
        amount: paid,
        stripe_session_id: `settled:${input.order?.id || input.quote_id}`,
        note: want === "paid" ? "Paid in full" : "Partial payment",
      },
    });
    return;
  }

  await upsertCateringBooking(base);
}

export async function listCateringBookings(opts?: {
  from?: string;
  to?: string;
  q?: string;
}): Promise<CateringBooking[]> {
  await syncDocumentsOntoCalendar();
  const db = await getDb();
  let list = [...(db.catering_bookings || [])];
  if (opts?.q?.trim()) {
    list = list.filter((b) => bookingMatches(b, opts.q!));
  } else {
    if (opts?.from) list = list.filter((b) => b.event_date >= opts.from!);
    if (opts?.to) list = list.filter((b) => b.event_date <= opts.to!);
  }
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
