import { NextResponse } from "next/server";
import { applyPaidCheckout } from "@/lib/apply-payment";
import { reportError } from "@/lib/monitor";
import { serverEnv } from "@/lib/server-env";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = serverEnv("STRIPE_WEBHOOK_SECRET");

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
    let session = event.data.object;
    if (!(secret && sig)) {
      // Unsigned body: trust only what Stripe itself returns for this session id.
      try {
        session = await stripe.checkout.sessions.retrieve(String(session?.id || ""));
      } catch {
        return NextResponse.json({ error: "Unknown session" }, { status: 400 });
      }
    }
    if (session.payment_status === "paid") {
      try {
        await applyPaidCheckout(session);
      } catch (err) {
        await reportError("stripe-webhook", err, {
          session: session.id,
          amount: session.amount_total != null ? session.amount_total / 100 : null,
          customer: session.customer_details?.email || session.customer_email,
        });
        return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
