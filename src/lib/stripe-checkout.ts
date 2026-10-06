import type Stripe from "stripe";
import { toCents } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";

export type PaymentKind = "desk_invoice" | "quote_deposit" | "checkout";

/**
 * Hosted pay link on the Stone Craft Stripe account.
 * Card only, matching Stone Craft's payment intent, with the catering order tagged
 * on the Checkout Session and on the charge.
 */
export async function createCateringPaymentLink(input: {
  customer_email: string;
  amount: number;
  product_name: string;
  description: string;
  success_url: string;
  cancel_url: string;
  order_id: string;
  order_number: string;
  invoice_number?: string;
  kind: PaymentKind;
  extra?: Record<string, string>;
}) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured, so a pay link cannot be sent.");
  }
  const metadata: Record<string, string> = {
    business: "Yogiplate",
    kind: input.kind,
    order_id: input.order_id,
    order_number: input.order_number,
    invoice_number: input.invoice_number || "",
    ...(input.extra || {}),
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customer_email,
    client_reference_id: input.order_number,
    success_url: input.success_url,
    cancel_url: input.cancel_url,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.max(50, toCents(input.amount)),
          product_data: {
            name: input.product_name.slice(0, 120),
            description: input.description.slice(0, 400),
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      receipt_email: input.customer_email,
      description: `Order ${input.order_number}`,
      metadata,
    },
  });
  if (!session.url) throw new Error("Stripe did not return a pay link.");
  return session;
}

export function sessionOrderMeta(session: {
  metadata?: Stripe.Metadata | null;
}) {
  const meta = session.metadata || {};
  return {
    kind: String(meta.kind || ""),
    order_id: String(meta.order_id || ""),
    order_number: String(meta.order_number || ""),
    invoice_number: String(meta.invoice_number || ""),
    quote_id: String(meta.quote_id || ""),
    pending_id: String(meta.pending_id || ""),
  };
}
