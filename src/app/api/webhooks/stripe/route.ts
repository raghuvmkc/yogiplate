import { NextResponse } from "next/server";
import { applyPaidCheckout } from "@/lib/apply-payment";
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
    const session = event.data.object;
    if (session.payment_status === "paid") {
      await applyPaidCheckout(session);
    }
  }

  return NextResponse.json({ received: true });
}
