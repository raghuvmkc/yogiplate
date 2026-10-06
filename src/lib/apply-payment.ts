import type Stripe from "stripe";
import { markDeskInvoicePaid } from "@/lib/desk-invoice";
import { fulfillPaidOrder } from "@/lib/orders";
import { markQuoteDepositPaid } from "@/lib/quotes";
import { fromCents } from "@/lib/pricing";
import { sessionOrderMeta } from "@/lib/stripe-checkout";
import { getDb } from "@/lib/store/local-db";
import { takePending } from "@/lib/store/pending";
import type { CartLine, DietTag } from "@/lib/types";

async function paidSummary(orderId: string) {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  if (!order) return null;
  const invoice = db.invoices.find((row) => row.order_id === order.id);
  return {
    order_number: order.order_number,
    invoice_number: invoice?.invoice_number || "",
  };
}

function checkoutAmount(session: Stripe.Checkout.Session) {
  if (session.amount_total == null) return undefined;
  return fromCents(session.amount_total);
}

/** After Stripe reports the pay link as paid, update the order, invoice, and calendar. */
export async function applyPaidCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    throw new Error("Payment not completed");
  }
  const meta = sessionOrderMeta(session);

  if (meta.kind === "desk_invoice" && meta.order_id) {
    await markDeskInvoicePaid(meta.order_id, session.id, checkoutAmount(session));
    const summary = await paidSummary(meta.order_id);
    if (!summary) throw new Error("Order not found");
    return summary;
  }

  if (meta.kind === "quote_deposit" && meta.quote_id) {
    await markQuoteDepositPaid({
      quoteId: meta.quote_id,
      stripeSessionId: session.id,
      amount: checkoutAmount(session),
    });
    if (meta.order_id) {
      const summary = await paidSummary(meta.order_id);
      if (summary) return summary;
    }
    return {
      order_number: meta.order_number,
      invoice_number: meta.invoice_number,
    };
  }

  const db = await getDb();
  const already = db.orders.find(
    (row) => row.stripe_session_id === session.id || row.id === meta.order_id
  );
  if (already?.status === "paid") {
    const invoice = db.invoices.find((row) => row.order_id === already.id);
    return {
      order_number: already.order_number,
      invoice_number: invoice?.invoice_number || meta.invoice_number,
    };
  }

  if (meta.pending_id) {
    const pending = await takePending(meta.pending_id);
    if (pending) {
      const result = await fulfillPaidOrder({
        ...pending,
        stripe_session_id: session.id,
        order_id: pending.order_id || meta.order_id || undefined,
        order_number: pending.order_number || meta.order_number || undefined,
        invoice_number: pending.invoice_number || meta.invoice_number || undefined,
      });
      return {
        order_number: result.order.order_number,
        invoice_number: result.invoice_number,
      };
    }
    const again = await paidSummary(meta.order_id);
    if (again) return again;
    const bySession = (await getDb()).orders.find(
      (row) => row.stripe_session_id === session.id
    );
    if (bySession) {
      if (bySession.status !== "paid") {
        await markDeskInvoicePaid(
          bySession.id,
          session.id,
          checkoutAmount(session)
        );
      }
      const summary = await paidSummary(bySession.id);
      if (summary) return summary;
    }
  }

  const raw = session.metadata || {};
  let items: CartLine[] = [];
  try {
    items = JSON.parse(String(raw.items_json || "[]"));
  } catch {
    items = [];
  }
  if (!items.length) {
    throw new Error("Order already processed or missing");
  }

  const result = await fulfillPaidOrder({
    customer_name: String(raw.customer_name || session.customer_details?.name || ""),
    customer_email: String(
      raw.customer_email ||
        session.customer_email ||
        session.customer_details?.email ||
        ""
    ),
    customer_phone: String(raw.customer_phone || ""),
    diet_profile: (String(raw.diet_profile || "pure_vegetarian") as DietTag),
    event_date: String(raw.event_date || ""),
    guest_count: Number(raw.guest_count) || 0,
    delivery_address: String(raw.delivery_address || ""),
    delivery_city: String(raw.delivery_city || ""),
    delivery_state: String(raw.delivery_state || "CA"),
    delivery_zip: String(raw.delivery_zip || ""),
    delivery_miles: Number(raw.delivery_miles) || 0,
    items,
    coupon_code: raw.coupon_code ? String(raw.coupon_code) : null,
    notes: raw.notes ? String(raw.notes) : null,
    stripe_session_id: session.id,
    order_id: meta.order_id || undefined,
    order_number: meta.order_number || undefined,
    invoice_number: meta.invoice_number || undefined,
  });
  return {
    order_number: result.order.order_number,
    invoice_number: result.invoice_number,
  };
}
