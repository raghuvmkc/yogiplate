import { NextResponse } from "next/server";
import { fulfillPaidOrder } from "@/lib/orders";
import { markQuoteDepositPaid } from "@/lib/quotes";
import { getDb } from "@/lib/store/local-db";
import { takePending } from "@/lib/store/pending";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (secret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const db = await getDb();

    if (session.metadata?.kind === "quote_deposit" && session.metadata?.quote_id) {
      await markQuoteDepositPaid({
        quoteId: String(session.metadata.quote_id),
        stripeSessionId: session.id,
      });
      return NextResponse.json({ received: true, quote_deposit: true });
    }

    const existing = db.orders.find((o) => o.stripe_session_id === session.id);
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const pendingId = session.metadata?.pending_id;
    if (pendingId) {
      const pending = await takePending(pendingId);
      if (pending) {
        await fulfillPaidOrder({
          ...pending,
          stripe_session_id: session.id,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
