import { NextResponse } from "next/server";
import { fulfillPaidOrder } from "@/lib/orders";
import { getDb } from "@/lib/store/local-db";
import { getPending, takePending } from "@/lib/store/pending";
import { getStripe } from "@/lib/stripe";
import type { CartLine, DietTag } from "@/lib/types";

export async function POST(req: Request) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const db = await getDb();
  const existing = db.orders.find((o) => o.stripe_session_id === session_id);
  if (existing) {
    const inv = db.invoices.find((i) => i.order_id === existing.id);
    return NextResponse.json({
      order_number: existing.order_number,
      invoice_number: inv?.invoice_number,
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(session_id);
  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const pendingId = session.metadata?.pending_id;
  if (pendingId) {
    const pending = await takePending(pendingId);
    if (pending) {
      const result = await fulfillPaidOrder({
        ...pending,
        stripe_session_id: session.id,
      });
      return NextResponse.json({
        order_number: result.order.order_number,
        invoice_number: result.invoice_number,
      });
    }
    // already taken by webhook — look up again
    const again = db.orders.find((o) => o.stripe_session_id === session_id);
    if (again) {
      const inv = db.invoices.find((i) => i.order_id === again.id);
      return NextResponse.json({
        order_number: again.order_number,
        invoice_number: inv?.invoice_number,
      });
    }
  }

  // Legacy metadata fallback
  const meta = session.metadata || {};
  let items: CartLine[] = [];
  try {
    items = JSON.parse(meta.items_json || "[]");
  } catch {
    items = [];
  }
  if (!items.length) {
    const still = pendingId ? await getPending(pendingId) : null;
    if (!still) {
      return NextResponse.json({ error: "Order already processed or missing" }, { status: 400 });
    }
  }

  const result = await fulfillPaidOrder({
    customer_name: meta.customer_name || session.customer_details?.name || "",
    customer_email:
      meta.customer_email ||
      session.customer_email ||
      session.customer_details?.email ||
      "",
    customer_phone: meta.customer_phone || "",
    diet_profile: (meta.diet_profile || "jain") as DietTag,
    event_date: meta.event_date || "",
    guest_count: Number(meta.guest_count) || 0,
    delivery_address: meta.delivery_address || "",
    delivery_city: meta.delivery_city || "",
    delivery_state: meta.delivery_state || "CA",
    delivery_zip: meta.delivery_zip || "",
    delivery_miles: Number(meta.delivery_miles) || 0,
    items,
    coupon_code: meta.coupon_code || null,
    notes: meta.notes || null,
    stripe_session_id: session.id,
  });

  return NextResponse.json({
    order_number: result.order.order_number,
    invoice_number: result.invoice_number,
  });
}
