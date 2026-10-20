import crypto from "crypto";
import { buildInvoiceHtml } from "@/lib/invoice";
import { formatMoney, fromCents, isPaidInFull, toCents } from "@/lib/pricing";
import { serverEnv } from "@/lib/server-env";
import { siteUrl } from "@/lib/site";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import { getDb, updateDb } from "@/lib/store/local-db";
import type { Order } from "@/lib/types";

function paySecret() {
  return serverEnv("ADMIN_SESSION_SECRET", "yogiplate-session");
}

/** Stable token so pay links are not guessable from order id alone. */
export function payInvoiceToken(orderId: string) {
  return crypto.createHmac("sha256", paySecret()).update(`pay:${orderId}`).digest("base64url");
}

export function verifyPayInvoiceToken(orderId: string, token: string | null | undefined) {
  if (!token) return false;
  const expected = Buffer.from(payInvoiceToken(orderId));
  const given = Buffer.from(String(token));
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

/** Lasting Yogiplate URL for invoice emails — not a Stripe Checkout Session URL. */
export function payInvoiceUrl(orderId: string) {
  return `${siteUrl()}/pay/${encodeURIComponent(orderId)}?t=${payInvoiceToken(orderId)}`;
}

/** Pay button URL for invoice HTML — null when nothing is due. */
export function openInvoicePayUrl(orderId: string, paidInFull: boolean) {
  return paidInFull ? null : payInvoiceUrl(orderId);
}

function paidOn(order: Order): number {
  if (order.payments?.length) {
    return fromCents(order.payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  }
  if (order.amount_paid) return order.amount_paid;
  return order.status === "paid" ? order.total : 0;
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

export type PaySessionResult =
  | { status: "ok"; url: string }
  | { status: "paid" }
  | { status: "cancelled" }
  | { status: "missing" }
  | { status: "stripe_unavailable" };

/** Expire any prior open Checkout Session, then mint a fresh one for the balance due. */
export async function refreshOpenPaySession(orderId: string): Promise<PaySessionResult> {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  const invoice = db.invoices.find((row) => row.order_id === orderId);
  if (!order || !invoice) return { status: "missing" };
  if (order.status === "cancelled") return { status: "cancelled" };

  const booking = (db.catering_bookings || []).find((row) => row.order_id === orderId);
  if (booking?.status === "cancelled") return { status: "cancelled" };

  const paid = paidOn(order);
  const balanceCents = toCents(order.total) - toCents(paid);
  if (balanceCents < 50 || isPaidInFull(paid, order.total)) return { status: "paid" };

  if (!stripeConfigured()) return { status: "stripe_unavailable" };
  const stripe = getStripe();
  if (!stripe) return { status: "stripe_unavailable" };

  const prior = order.stripe_session_id?.trim() || "";
  if (prior.startsWith("cs_")) {
    await stripe.checkout.sessions.expire(prior).catch(() => null);
  }

  const items = db.order_items.filter((row) => row.order_id === orderId);
  const durable = payInvoiceUrl(orderId);
  const session = await createCateringPaymentLink({
    customer_email: order.customer_email,
    amount: fromCents(balanceCents),
    product_name: `Yogiplate invoice ${invoice.invoice_number}`,
    description: `Order ${order.order_number}. ${
      toCents(paid) > 0 ? "Balance due." : items.map((item) => `${item.name} × ${item.quantity}`).join(", ")
    }`,
    success_url: `${siteUrl()}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: durable,
    order_id: order.id,
    order_number: order.order_number,
    invoice_number: invoice.invoice_number,
    kind: "desk_invoice",
  });
  if (!session.url) throw new Error("Stripe did not return a pay link.");

  const label = invoiceLabel(order);
  await updateDb((next) => {
    const row = next.orders.find((item) => item.id === orderId);
    const inv = next.invoices.find((item) => item.order_id === orderId);
    if (row) row.stripe_session_id = session.id;
    if (inv) {
      // Keep the lasting Yogiplate URL on the invoice; Stripe URLs expire in 24 hours.
      inv.pay_url = durable;
      inv.html = buildInvoiceHtml(
        row || order,
        next.order_items.filter((item) => item.order_id === orderId),
        next.settings,
        inv.invoice_number,
        durable,
        { paidLabel: label }
      );
    }
  });

  return { status: "ok", url: session.url };
}

/**
 * Point the invoice at a lasting Yogiplate pay URL and rebuild the email HTML.
 * Does not create a Stripe session — that happens when the guest clicks Pay.
 */
export async function ensureFreshInvoicePayLink(orderId: string) {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  const invoice = db.invoices.find((row) => row.order_id === orderId);
  if (!order || !invoice || order.status === "cancelled") return null;

  const paid = paidOn(order);
  const balanceCents = toCents(order.total) - toCents(paid);
  if (balanceCents < 50) {
    await updateDb((next) => {
      const inv = next.invoices.find((row) => row.order_id === orderId);
      const ord = next.orders.find((row) => row.id === orderId);
      if (!inv || !ord) return;
      inv.pay_url = null;
      inv.html = buildInvoiceHtml(
        ord,
        next.order_items.filter((row) => row.order_id === orderId),
        next.settings,
        inv.invoice_number,
        null,
        { paidLabel: invoiceLabel(ord) }
      );
    });
    return null;
  }

  const durable = payInvoiceUrl(orderId);
  await updateDb((next) => {
    const inv = next.invoices.find((row) => row.order_id === orderId);
    const ord = next.orders.find((row) => row.id === orderId);
    if (!inv || !ord) return;
    inv.pay_url = durable;
    inv.html = buildInvoiceHtml(
      ord,
      next.order_items.filter((row) => row.order_id === orderId),
      next.settings,
      inv.invoice_number,
      durable,
      { paidLabel: invoiceLabel(ord) }
    );
  });
  return durable;
}
