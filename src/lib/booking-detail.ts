import { appendPaymentRecord, upsertCateringBooking } from "@/lib/calendar-bookings";
import { buildInvoiceHtml, sendInvoiceEmail } from "@/lib/invoice";
import {
  chargeTotals,
  formatMoney,
  fromCents,
  isPaidInFull,
  lineCents,
  lineTotal,
  percentCents,
  toCents,
} from "@/lib/pricing";
import { siteUrl } from "@/lib/site";
import { sendGuestQuoteSmtp, smtpConfigured } from "@/lib/smtp";
import { stripeConfigured } from "@/lib/stripe";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import {
  getDb,
  invoiceNumber,
  orderNumber,
  uid,
  updateDb,
  type LocalDatabase,
} from "@/lib/store/local-db";
import type {
  CateringBooking,
  DietTag,
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  Quote,
  QuoteLine,
} from "@/lib/types";

/** One pickable menu line: a dish, or a dish at a specific tray size. */
export type MenuChoice = {
  key: string;
  menu_item_id: string;
  category: string;
  name: string;
  unit_price: number;
  unit: string;
  min_quantity: number;
};

export type BookingDetail = {
  booking: CateringBooking;
  order: Order | null;
  order_items: OrderItem[];
  invoice: Pick<Invoice, "id" | "invoice_number" | "email_sent_at" | "pay_url"> | null;
  quote: Quote | null;
  amount_due: number | null;
  amount_paid: number;
  balance_due: number | null;
  tax_rate: number;
  base_delivery_fee: number;
  menu: MenuChoice[];
};

export type EditableLine = {
  id?: string;
  menu_item_id?: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit?: string;
};

export type BookingDetailPatch = {
  booking?: Partial<
    Pick<
      CateringBooking,
      | "event_date"
      | "event_time"
      | "status"
      | "customer_name"
      | "customer_email"
      | "customer_phone"
      | "guest_count"
      | "diet"
      | "occasion"
      | "meal"
      | "delivery_or_pickup"
      | "city"
      | "address"
      | "setup_needs"
      | "special_requirements"
      | "notes"
      | "admin_notes"
    >
  >;
  order?: {
    status?: OrderStatus;
    delivery_fee?: number;
    discount?: number;
    notes?: string | null;
    items?: EditableLine[];
  };
  quote_items?: EditableLine[];
};

function paidOn(order: Order): number {
  if (order.payments?.length) {
    return fromCents(order.payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  }
  if (order.amount_paid) return order.amount_paid;
  return order.status === "paid" ? order.total : 0;
}

function linked(db: LocalDatabase, booking: CateringBooking) {
  const quote =
    (booking.quote_id && (db.quotes || []).find((row) => row.id === booking.quote_id)) ||
    (booking.order_id && (db.quotes || []).find((row) => row.order_id === booking.order_id)) ||
    null;
  const orderId = booking.order_id || quote?.order_id || null;
  const order = orderId ? db.orders.find((row) => row.id === orderId) || null : null;
  const invoice = order ? db.invoices.find((row) => row.order_id === order.id) || null : null;
  const items = order ? db.order_items.filter((row) => row.order_id === order.id) : [];
  return { quote, order, invoice, items };
}

export async function getBookingDetail(id: string): Promise<BookingDetail | null> {
  const db = await getDb();
  const booking = (db.catering_bookings || []).find((row) => row.id === id);
  if (!booking) return null;
  const { quote, order, invoice, items } = linked(db, booking);
  const amount_due = order?.total ?? quote?.estimated_total ?? booking.amount_due ?? null;
  const amount_paid = order ? paidOn(order) : (booking.amount_paid ?? 0);
  return {
    booking,
    order,
    order_items: items,
    invoice: invoice
      ? {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          email_sent_at: invoice.email_sent_at,
          pay_url: invoice.pay_url ?? null,
        }
      : null,
    quote,
    amount_due,
    amount_paid,
    balance_due:
      amount_due == null ? null : fromCents(Math.max(0, toCents(amount_due) - toCents(amount_paid))),
    tax_rate: db.settings.tax_rate,
    base_delivery_fee: db.settings.base_delivery_fee,
    menu: menuChoices(db),
  };
}

function menuChoices(db: LocalDatabase): MenuChoice[] {
  const categories = new Map(db.categories.map((c) => [c.id, c]));
  return db.menu_items
    .filter((item) => item.is_available)
    .sort(
      (a, b) =>
        (categories.get(a.category_id)?.sort_order ?? 999) -
          (categories.get(b.category_id)?.sort_order ?? 999) || a.name.localeCompare(b.name)
    )
    .flatMap((item): MenuChoice[] => {
      const category = categories.get(item.category_id)?.name || "Menu";
      const min = Math.max(1, item.min_quantity || 1);
      if (item.variants?.length) {
        return item.variants.map((variant) => ({
          key: `${item.id}:${variant.id}`,
          menu_item_id: item.id,
          category,
          name: `${item.name} (${variant.label})`,
          unit_price: variant.price,
          unit: variant.unit || item.unit,
          min_quantity: min,
        }));
      }
      return [
        {
          key: item.id,
          menu_item_id: item.id,
          category,
          name: item.name,
          unit_price: item.price,
          unit: item.unit,
          min_quantity: min,
        },
      ];
    });
}

const DIET_TAGS: DietTag[] = ["jain", "swaminarayan", "pushtimarg", "pure_vegetarian", "vegan", "italian"];

/** Start an order (and its invoice) for a calendar entry that has neither an order nor a quote. */
function startOrderForBooking(db: LocalDatabase, row: CateringBooking, now: string): Order {
  const email = (row.customer_email || "").trim();
  const customer = email
    ? db.customers.find((c) => c.email.toLowerCase() === email.toLowerCase())
    : undefined;
  const diet = (row.diet || "").toLowerCase().replace(/[\s-]+/g, "_") as DietTag;
  const pickup = row.delivery_or_pickup === "pickup";
  const order: Order = {
    id: uid("ord"),
    order_number: orderNumber(),
    customer_id: customer?.id || uid("cust"),
    customer_name: row.customer_name || "Guest",
    customer_email: email,
    customer_phone: row.customer_phone || "",
    diet_profile: DIET_TAGS.includes(diet) ? diet : "pure_vegetarian",
    event_date: row.event_date,
    guest_count: row.guest_count || 0,
    delivery_address: pickup ? "Pickup" : row.address || "",
    delivery_city: row.city || "",
    delivery_state: "CA",
    delivery_zip: "",
    delivery_miles: 0,
    subtotal: 0,
    delivery_fee: pickup ? 0 : db.settings.base_delivery_fee,
    discount: 0,
    tax: 0,
    total: 0,
    coupon_code: null,
    status: "pending",
    stripe_session_id: null,
    notes: row.notes || null,
    created_at: now,
    paid_at: null,
    amount_paid: 0,
    payments: [...(row.payments || [])],
  };
  db.orders.push(order);
  db.invoices.push({
    id: uid("inv"),
    order_id: order.id,
    invoice_number: invoiceNumber(),
    html: "",
    pay_url: null,
    email_sent_at: null,
    created_at: now,
  });
  row.order_id = order.id;
  if (row.status === "unconfirmed") row.status = "order_placed";
  return order;
}

function cleanLines(lines: EditableLine[]): EditableLine[] {
  return lines
    .map((line) => ({
      ...line,
      name: String(line.name || "").trim(),
      unit_price: fromCents(Math.max(0, toCents(Number(line.unit_price) || 0))),
      quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
    }))
    .filter((line) => line.name && line.quantity > 0);
}

function invoiceLabel(order: Order): string | null {
  const paid = paidOn(order);
  if (isPaidInFull(paid, order.total)) return "Paid in full";
  if (toCents(paid) > 0) {
    const count = order.payments?.length || 0;
    return `Partial payment ${formatMoney(paid)} of ${formatMoney(order.total)}${
      count > 1 ? ` · ${count} payments` : ""
    } · Balance ${formatMoney(fromCents(toCents(order.total) - toCents(paid)))}`;
  }
  return null;
}

function itemsSummary(lines: { name: string; quantity: number }[]) {
  return lines.map((line) => `${line.quantity}× ${line.name}`).join("; ");
}

/** Save admin edits to the calendar entry, its order, and its invoice, then refresh the calendar color. */
export async function saveBookingDetail(id: string, patch: BookingDetailPatch) {
  const before = await getDb();
  const booking = (before.catering_bookings || []).find((row) => row.id === id);
  if (!booking) throw new Error("Booking not found");
  let orderId = linked(before, booking).order?.id ?? null;
  let totalChanged = false;

  await updateDb((db) => {
    const row = (db.catering_bookings || []).find((item) => item.id === id);
    if (!row) return;
    const found = linked(db, row);
    const quote = found.quote;
    let { order, invoice } = found;
    const now = new Date().toISOString();

    if (patch.booking) {
      Object.assign(row, patch.booking);
      if (patch.booking.guest_count != null) {
        row.guest_count = Number(patch.booking.guest_count) || null;
      }
    }

    if (!order && !quote && patch.order?.items && cleanLines(patch.order.items).length) {
      order = startOrderForBooking(db, row, now);
      invoice = db.invoices.find((item) => item.order_id === order!.id) || null;
      orderId = order.id;
    }

    if (order) {
      const edit = patch.order || {};
      if (edit.items) {
        const lines = cleanLines(edit.items);
        if (!lines.length) throw new Error("An order needs at least one menu line.");
        db.order_items = db.order_items.filter((item) => item.order_id !== order.id);
        db.order_items.push(
          ...lines.map((line) => ({
            id: line.id || uid("oi"),
            order_id: order.id,
            menu_item_id: line.menu_item_id || "custom",
            name: line.name,
            unit_price: line.unit_price,
            quantity: line.quantity,
            line_total: lineTotal(line.unit_price, line.quantity),
          }))
        );
      }
      const items = db.order_items.filter((item) => item.order_id === order.id);
      const subtotal = fromCents(items.reduce((sum, item) => sum + lineCents(item.unit_price, item.quantity), 0));
      const priced = chargeTotals({
        subtotal,
        discount: edit.discount ?? order.discount,
        deliveryFee: edit.delivery_fee ?? order.delivery_fee,
        taxRate: db.settings.tax_rate,
      });
      totalChanged = toCents(priced.total) !== toCents(order.total);
      Object.assign(order, {
        subtotal: priced.subtotal,
        discount: priced.discount,
        delivery_fee: priced.delivery_fee,
        tax: priced.tax,
        total: priced.total,
      });
      if (edit.notes !== undefined) order.notes = edit.notes;
      if (edit.status) order.status = edit.status;
      if (patch.booking) {
        if (patch.booking.event_date) order.event_date = patch.booking.event_date;
        if (patch.booking.customer_name) order.customer_name = patch.booking.customer_name;
        if (patch.booking.customer_email) order.customer_email = patch.booking.customer_email;
        if (patch.booking.customer_phone !== undefined) order.customer_phone = patch.booking.customer_phone;
        if (patch.booking.guest_count != null) order.guest_count = Number(patch.booking.guest_count) || 0;
        if (patch.booking.address !== undefined) order.delivery_address = patch.booking.address || "";
        if (patch.booking.city !== undefined) order.delivery_city = patch.booking.city || "";
      }
      const paid = paidOn(order);
      if (isPaidInFull(paid, order.total)) {
        order.status = order.status === "pending" ? "paid" : order.status;
        order.paid_at = order.paid_at || now;
      } else if (order.status === "paid") {
        order.status = "pending";
      }
      order.amount_paid = paid;

      row.items_summary = itemsSummary(items);
      row.food_subtotal = order.subtotal;
      row.amount_due = order.total;
      row.amount_paid = paid;
      row.order_number = order.order_number;

      if (invoice) {
        const label = invoiceLabel(order);
        invoice.html = buildInvoiceHtml(
          order,
          items,
          db.settings,
          invoice.invoice_number,
          label === "Paid in full" ? null : invoice.pay_url,
          { paidLabel: label }
        );
        row.invoice_number = invoice.invoice_number;
      }
    }

    if (quote) {
      if (patch.quote_items && !order) {
        const lines = cleanLines(patch.quote_items);
        if (!lines.length) throw new Error("A quote needs at least one menu line.");
        quote.items = lines.map(
          (line): QuoteLine => ({
            menu_item_id: line.menu_item_id || "custom",
            name: line.name,
            unit_price: line.unit_price,
            quantity: line.quantity,
            unit: line.unit || "tray",
          })
        );
        const foodCents = quote.items.reduce((sum, line) => sum + lineCents(line.unit_price, line.quantity), 0);
        quote.food_subtotal = fromCents(foodCents);
        quote.estimated_total = quote.food_subtotal;
        quote.deposit_amount = fromCents(percentCents(foodCents, quote.deposit_percent));
        row.items_summary = itemsSummary(quote.items);
        row.food_subtotal = quote.food_subtotal;
        row.amount_due = quote.estimated_total;
      }
      if (patch.booking) {
        const b = patch.booking;
        if (b.event_date) quote.event_date = b.event_date;
        if (b.event_time !== undefined) quote.event_time = b.event_time;
        if (b.customer_name) quote.customer_name = b.customer_name;
        if (b.customer_email) quote.customer_email = b.customer_email;
        if (b.customer_phone !== undefined) quote.customer_phone = b.customer_phone;
        if (b.guest_count != null) quote.guest_count = Number(b.guest_count) || 0;
        if (b.special_requirements !== undefined) quote.special_requirements = b.special_requirements;
        if (b.setup_needs !== undefined) quote.setup_needs = b.setup_needs;
        if (b.occasion !== undefined) quote.occasion = b.occasion;
        if (b.address !== undefined) quote.address = b.address;
        if (b.city !== undefined) quote.city = b.city;
      }
      quote.updated_at = now;
      row.quote_number = quote.quote_number;
    }

    if (patch.booking?.status !== "cancelled") {
      const due = row.amount_due;
      const paid = row.amount_paid || 0;
      if (due != null && isPaidInFull(paid, due)) row.status = "paid";
      else if (toCents(paid) > 0) row.status = "partial";
    }
    row.updated_at = now;
  });

  if (totalChanged && orderId) {
    await refreshPayLink(orderId).catch(() => null);
  }
  return getBookingDetail(id);
}

/** Issue a new Stripe link for the remaining balance after the total changes. */
async function refreshPayLink(orderId: string) {
  if (!stripeConfigured()) return;
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  const invoice = db.invoices.find((row) => row.order_id === orderId);
  if (!order || !invoice) return;
  const balanceCents = toCents(order.total) - toCents(paidOn(order));
  if (balanceCents < 50) return;
  const items = db.order_items.filter((row) => row.order_id === orderId);
  const session = await createCateringPaymentLink({
    customer_email: order.customer_email,
    amount: fromCents(balanceCents),
    product_name: `Yogiplate invoice ${invoice.invoice_number}`,
    description: `Order ${order.order_number}. Balance due.`,
    success_url: `${siteUrl()}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: siteUrl(),
    order_id: order.id,
    order_number: order.order_number,
    invoice_number: invoice.invoice_number,
    kind: "desk_invoice",
  });
  await updateDb((next) => {
    const inv = next.invoices.find((row) => row.id === invoice.id);
    const ord = next.orders.find((row) => row.id === orderId);
    if (!inv || !ord) return;
    inv.pay_url = session.url;
    const label = invoiceLabel(ord);
    inv.html = buildInvoiceHtml(ord, items, next.settings, inv.invoice_number, session.url, {
      paidLabel: label,
    });
  });
}

/** Cash, check, Zelle, or any payment taken outside Stripe. */
export async function recordManualPayment(
  id: string,
  input: { amount: number; note?: string | null; paid_at?: string | null }
) {
  const cents = toCents(Number(input.amount) || 0);
  if (cents <= 0) throw new Error("Enter a payment amount greater than zero.");
  const db = await getDb();
  const booking = (db.catering_bookings || []).find((row) => row.id === id);
  if (!booking) throw new Error("Booking not found");
  const { order } = linked(db, booking);
  const payment = {
    amount: fromCents(cents),
    stripe_session_id: `manual:${uid("pay")}`,
    paid_at: input.paid_at || new Date().toISOString(),
    note: input.note?.trim() || "Manual payment",
  };

  if (order) {
    await updateDb((next) => {
      const row = next.orders.find((item) => item.id === order.id);
      if (!row) return;
      row.payments = appendPaymentRecord(row.payments, payment);
      const paid = paidOn(row);
      row.amount_paid = paid;
      if (isPaidInFull(paid, row.total)) {
        row.status = row.status === "pending" ? "paid" : row.status;
        row.paid_at = row.paid_at || payment.paid_at;
      }
      const invoice = next.invoices.find((item) => item.order_id === row.id);
      if (invoice) {
        const label = invoiceLabel(row);
        invoice.html = buildInvoiceHtml(
          row,
          next.order_items.filter((item) => item.order_id === row.id),
          next.settings,
          invoice.invoice_number,
          label === "Paid in full" ? null : invoice.pay_url,
          { paidLabel: label }
        );
      }
    });
  }

  await updateDb((next) => {
    const row = (next.catering_bookings || []).find((item) => item.id === id);
    if (!row) return;
    row.payments = appendPaymentRecord(row.payments, payment);
    row.amount_paid = fromCents(row.payments.reduce((sum, item) => sum + toCents(item.amount), 0));
    if (order) row.amount_due = order.total;
    if (row.status !== "cancelled") {
      row.status =
        row.amount_due != null && isPaidInFull(row.amount_paid, row.amount_due) ? "paid" : "partial";
    }
    row.updated_at = new Date().toISOString();
  });
  return getBookingDetail(id);
}

/** Email the current invoice, including the newest pay link, to the guest. */
export async function emailBookingInvoice(id: string) {
  const detail = await getBookingDetail(id);
  if (!detail?.order || !detail.invoice) throw new Error("This booking has no invoice yet.");
  const db = await getDb();
  const invoice = db.invoices.find((row) => row.id === detail.invoice!.id)!;
  const order = detail.order;
  const subject = `Yogiplate Invoice ${invoice.invoice_number} — Order ${order.order_number}`;
  let sent = false;
  let reason: string | undefined;
  try {
    const result = await sendInvoiceEmail({ to: order.customer_email, subject, html: invoice.html });
    sent = result.sent;
    if (!result.sent) reason = result.reason;
  } catch (err) {
    reason = err instanceof Error ? err.message : "send_failed";
  }
  if (!sent && smtpConfigured()) {
    await sendGuestQuoteSmtp({
      to: order.customer_email,
      name: order.customer_name,
      subject,
      html: invoice.html,
      text: `Invoice ${invoice.invoice_number} for order ${order.order_number}. Total ${formatMoney(order.total)}.${
        invoice.pay_url ? ` Pay: ${invoice.pay_url}` : ""
      }`,
    });
    sent = true;
  }
  if (!sent) throw new Error(reason || "Email is not configured.");
  await updateDb((next) => {
    const inv = next.invoices.find((row) => row.id === invoice.id);
    if (inv) inv.email_sent_at = new Date().toISOString();
  });
  await upsertCateringBooking({
    event_date: detail.booking.event_date,
    customer_name: detail.booking.customer_name,
    customer_email: detail.booking.customer_email,
    customer_phone: detail.booking.customer_phone,
    order_id: order.id,
    invoice_number: invoice.invoice_number,
    amount_due: order.total,
    status: "invoice_sent",
  });
  return getBookingDetail(id);
}
