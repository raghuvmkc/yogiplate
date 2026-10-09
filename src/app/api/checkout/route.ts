import { NextResponse } from "next/server";
import { upsertCateringBooking } from "@/lib/calendar-bookings";
import { deliveryProblem, quoteDelivery } from "@/lib/delivery";
import { findCoupon, fulfillPaidOrder } from "@/lib/orders";
import { reportError } from "@/lib/monitor";
import { guestPaymentErrorMessage } from "@/lib/payment-errors";
import { calcOrderTotals, cartSubtotal, setupNeedsLabel } from "@/lib/pricing";
import { repriceCart } from "@/lib/reprice-cart";
import { stripeConfigured } from "@/lib/stripe";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import { siteUrl } from "@/lib/site";
import { getDb, invoiceNumber, orderNumber, uid } from "@/lib/store/local-db";
import { savePending } from "@/lib/store/pending";
import type { CartLine, DietTag } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const requested = (body.items || []) as CartLine[];
    if (!requested.length) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }
    if (!body.diet_profile || !body.event_date) {
      return NextResponse.json(
        { error: "Diet profile and event date are required." },
        { status: 400 }
      );
    }

    const db = await getDb();
    let items: CartLine[];
    try {
      items = repriceCart(db, requested);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    const quote = await quoteDelivery({
      address: body.delivery_address,
      city: body.delivery_city,
      state: body.delivery_state,
      zip: body.delivery_zip,
      subtotal: cartSubtotal(items),
      settings: db.settings,
    });

    const problem = deliveryProblem(quote);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const coupon = body.coupon_code
      ? await findCoupon(String(body.coupon_code))
      : null;
    const setup = body.setup_service === true;
    const totals = calcOrderTotals({
      items,
      miles: quote.miles,
      coupon,
      settings: db.settings,
      setup,
    });

    const eventTime = /^\d{2}:\d{2}$/.test(String(body.event_time || ""))
      ? String(body.event_time)
      : "";
    const site = siteUrl();
    const orderId = uid("ord");
    const ordNum = orderNumber();
    const invNum = invoiceNumber();

    await upsertCateringBooking({
      event_date: String(body.event_date),
      event_time: eventTime || null,
      customer_name: String(body.customer_name || "Guest"),
      customer_email: String(body.customer_email || ""),
      customer_phone: String(body.customer_phone || ""),
      order_id: orderId,
      order_number: ordNum,
      invoice_number: invNum,
      amount_due: totals.total,
      food_subtotal: totals.subtotal,
      items_summary: items.map((item) => `${item.quantity}× ${item.name}`).join("; "),
      status: "order_placed",
      draft: {
        event_date: String(body.event_date),
        event_time: eventTime,
        diet: String(body.diet_profile || ""),
        adults: Number(body.guest_count) || null,
        kids: null,
        city: String(body.delivery_city || ""),
        address: String(body.delivery_address || ""),
        notes: body.notes ? String(body.notes) : "",
        delivery_or_pickup: "delivery",
        occasion: "",
        meal: "",
        budget: "",
        setup_needs: setup ? setupNeedsLabel(totals.setup_fee) : "",
        special_requirements: "",
        package_tier: "",
        confirmed: false,
      },
    }).catch(() => null);

    const pendingId = uid("pending");
    await savePending({
      id: pendingId,
      order_id: orderId,
      order_number: ordNum,
      invoice_number: invNum,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      diet_profile: body.diet_profile as DietTag,
      event_date: body.event_date,
      event_time: eventTime || null,
      guest_count: Number(body.guest_count) || 0,
      delivery_address: body.delivery_address,
      delivery_city: body.delivery_city,
      delivery_state: body.delivery_state,
      delivery_zip: body.delivery_zip,
      delivery_miles: quote.miles,
      items,
      coupon_code: coupon?.code || null,
      notes: body.notes || null,
      setup_service: setup,
      created_at: new Date().toISOString(),
    });

    if (stripeConfigured()) {
      const session = await createCateringPaymentLink({
        customer_email: body.customer_email,
        amount: totals.total,
        product_name: `Yogiplate catering — ${ordNum}`,
        description: `Order ${ordNum}. ${items
          .map((i) => `${i.name} × ${i.quantity}`)
          .join(", ")}`,
        success_url: `${site}/order/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/checkout`,
        order_id: orderId,
        order_number: ordNum,
        invoice_number: invNum,
        kind: "checkout",
        extra: { pending_id: pendingId, setup_service: setup ? "1" : "0" },
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
    await reportError("checkout", err);
    return NextResponse.json(
      {
        error:
          guestPaymentErrorMessage(err) ||
          "Checkout failed. Please try again, or call us to place the order.",
      },
      { status: 500 }
    );
  }
}
