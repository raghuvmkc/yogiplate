import { appendPaymentRecord } from "@/lib/calendar-bookings";
import { buildInvoiceHtml } from "@/lib/invoice";
import { fromCents, isPaidInFull, toCents } from "@/lib/pricing";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getDb, updateDb } from "@/lib/store/local-db";
import { getBookingDetail } from "@/lib/booking-detail";

function paidOn(order: { payments?: { amount: number }[]; amount_paid?: number; status: string; total: number }) {
  if (order.payments?.length) {
    return fromCents(order.payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  }
  if (order.amount_paid) return order.amount_paid;
  return order.status === "paid" ? order.total : 0;
}

function invoiceLabel(order: { amount_paid?: number; total: number; payments?: unknown[] }) {
  const paid = order.amount_paid || 0;
  if (isPaidInFull(paid, order.total)) return "Paid in full";
  if (toCents(paid) > 0) {
    return `Partial payment · ${order.payments?.length || 1} payment(s)`;
  }
  return null;
}

/** Create a PaymentIntent so the desk can enter the guest's card in Stripe Elements. */
export async function createBookingCardIntent(bookingId: string, amount: number) {
  if (!stripeConfigured()) {
    throw new Error("Stripe is not configured, so card payments cannot be taken here.");
  }
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const cents = toCents(Number(amount) || 0);
  if (cents < 50) throw new Error("Card payment must be at least $0.50.");

  const db = await getDb();
  const booking = (db.catering_bookings || []).find((row) => row.id === bookingId);
  if (!booking) throw new Error("Booking not found");

  const order =
    (booking.order_id ? db.orders.find((row) => row.id === booking.order_id) : null) ||
    db.orders.find(
      (row) =>
        row.customer_email.toLowerCase() === (booking.customer_email || "").toLowerCase() &&
        row.event_date === booking.event_date
    ) ||
    null;
  if (!order) {
    throw new Error("Save this event as an order with dishes and a total before taking a card.");
  }

  const balanceCents = toCents(order.total) - toCents(paidOn(order));
  if (balanceCents < 50) throw new Error("This order is already paid in full.");
  if (cents > balanceCents) {
    throw new Error(`Amount cannot exceed the balance due (${fromCents(balanceCents)}).`);
  }

  const invoice = db.invoices.find((row) => row.order_id === order.id);
  const intent = await stripe.paymentIntents.create({
    amount: cents,
    currency: "usd",
    payment_method_types: ["card"],
    receipt_email: order.customer_email || undefined,
    description: `Yogiplate order ${order.order_number}`,
    metadata: {
      business: "Yogiplate",
      kind: "admin_card",
      booking_id: booking.id,
      order_id: order.id,
      order_number: order.order_number,
      invoice_number: invoice?.invoice_number || "",
    },
  });

  if (!intent.client_secret) {
    throw new Error("Stripe did not return a client secret for this payment.");
  }

  return {
    client_secret: intent.client_secret,
    payment_intent_id: intent.id,
    amount: fromCents(cents),
    order_id: order.id,
    order_number: order.order_number,
  };
}

/**
 * After Stripe confirms the card charge, verify the PaymentIntent and record it
 * on the order / booking (same path as a hosted pay-link payment).
 */
export async function confirmBookingCardPayment(bookingId: string, paymentIntentId: string) {
  if (!stripeConfigured()) throw new Error("Stripe is not configured.");
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded") {
    throw new Error(`Card payment is not complete yet (status: ${intent.status}).`);
  }
  if (intent.metadata?.kind !== "admin_card") {
    throw new Error("This payment is not an admin card charge.");
  }
  if (intent.metadata?.booking_id && intent.metadata.booking_id !== bookingId) {
    throw new Error("This payment belongs to a different booking.");
  }

  const orderId = intent.metadata?.order_id || "";
  if (!orderId) throw new Error("Payment is missing the order id.");

  const amount = fromCents(intent.amount_received || intent.amount);
  const paidAt = new Date().toISOString();
  const payment = {
    amount,
    stripe_session_id: intent.id,
    paid_at: paidAt,
    note: "Card (entered at desk)",
  };

  const db = await getDb();
  const already = db.orders
    .find((row) => row.id === orderId)
    ?.payments?.some((row) => row.stripe_session_id === intent.id);
  if (!already) {
    await updateDb((next) => {
      const row = next.orders.find((item) => item.id === orderId);
      if (!row) return;
      row.payments = appendPaymentRecord(row.payments, payment);
      const paid = paidOn(row);
      row.amount_paid = paid;
      row.stripe_session_id = intent.id;
      if (isPaidInFull(paid, row.total)) {
        row.status = row.status === "pending" ? "paid" : row.status;
        row.paid_at = row.paid_at || paidAt;
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
    const row = (next.catering_bookings || []).find((item) => item.id === bookingId);
    if (!row) return;
    if (!(row.payments || []).some((item) => item.stripe_session_id === intent.id)) {
      row.payments = appendPaymentRecord(row.payments, payment);
    }
    row.amount_paid = fromCents((row.payments || []).reduce((sum, item) => sum + toCents(item.amount), 0));
    const order = next.orders.find((item) => item.id === orderId);
    if (order) row.amount_due = order.total;
    if (row.status !== "cancelled") {
      row.status =
        row.amount_due != null && isPaidInFull(row.amount_paid, row.amount_due) ? "paid" : "partial";
    }
    row.updated_at = new Date().toISOString();
  });

  return getBookingDetail(bookingId);
}
