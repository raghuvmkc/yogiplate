import { NextResponse } from "next/server";
import { applyPaidCheckout } from "@/lib/apply-payment";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(String(session_id));
  try {
    const result = await applyPaidCheckout(session);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not confirm payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
