import { NextResponse } from "next/server";
import { quoteDelivery } from "@/lib/delivery";
import { findCoupon, fulfillPaidOrder } from "@/lib/orders";
import { calcOrderTotals } from "@/lib/pricing";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getDb, uid } from "@/lib/store/local-db";
import { savePending } from "@/lib/store/pending";
import type { CartLine, DietTag } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = (body.items || []) as CartLine[];
    if (!items.length) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }
    if (!body.diet_profile || !body.event_date) {
      return NextResponse.json(
        { error: "Diet profile and event date are required." },
        { status: 400 }
      );
    }

    const db = await getDb();
    const quote = await quoteDelivery({
      address: body.delivery_address,
      city: body.delivery_city,
      state: body.delivery_state,
      zip: body.delivery_zip,
      subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      settings: db.settings,
    });

    if (!quote.in_service) {
      return NextResponse.json(
        {
          error: `Outside service area (${quote.miles} mi). We deliver within ${db.settings.service_radius_miles} miles.`,
        },
        { status: 400 }
      );
    }

    const coupon = body.coupon_code
      ? await findCoupon(String(body.coupon_code))
      : null;
    const totals = calcOrderTotals({
      items,
      miles: quote.miles,
      coupon,
      settings: db.settings,
    });

    const pendingId = uid("pending");
    await savePending({
      id: pendingId,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      diet_profile: body.diet_profile as DietTag,
      event_date: body.event_date,
      guest_count: Number(body.guest_count) || 0,
      delivery_address: body.delivery_address,
      delivery_city: body.delivery_city,
      delivery_state: body.delivery_state,
      delivery_zip: body.delivery_zip,
      delivery_miles: quote.miles,
      items,
      coupon_code: coupon?.code || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    if (stripeConfigured()) {
      const stripe = getStripe()!;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: body.customer_email,
        success_url: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(totals.total * 100),
              product_data: {
                name: `Yogiplate catering — ${body.diet_profile}`,
                description: items
                  .map((i) => `${i.name} × ${i.quantity}`)
                  .join(", ")
                  .slice(0, 400),
              },
            },
          },
        ],
        metadata: { pending_id: pendingId },
      });
      return NextResponse.json({ url: session.url });
    }

    const pending = await import("@/lib/store/pending").then((m) =>
      m.takePending(pendingId)
    );
    if (!pending) {
      return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
    }

    const result = await fulfillPaidOrder({
      ...pending,
      stripe_session_id: null,
    });

    return NextResponse.json({
      order_number: result.order.order_number,
      invoice_number: result.invoice_number,
      demo: true,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
