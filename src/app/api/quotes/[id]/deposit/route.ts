import { NextResponse } from "next/server";
import { getQuoteByToken, markQuoteDepositPaid } from "@/lib/quotes";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import { updateDb } from "@/lib/store/local-db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let token = "";
  try {
    const body = await req.json();
    token = String(body.token || "");
  } catch {
    token = new URL(req.url).searchParams.get("t") || "";
  }

  const quote = await getQuoteByToken(id, token);
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.status === "deposit_paid" || quote.status === "accepted") {
    return NextResponse.json({
      already_paid: true,
      quote_id: quote.id,
      status: quote.status,
    });
  }
  if (quote.status === "expired" || quote.status === "cancelled") {
    return NextResponse.json({ error: "Quote is no longer active" }, { status: 400 });
  }

  if (stripeConfigured()) {
    const stripe = getStripe()!;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: quote.customer_email,
      success_url: `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}&deposit=1`,
      cancel_url: `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(quote.deposit_amount * 100),
            product_data: {
              name: `Yogiplate deposit — ${quote.quote_number}`,
              description: `Deposit (${quote.deposit_percent}%) for event ${quote.event_date || "TBD"}`,
            },
          },
        },
      ],
      metadata: {
        quote_id: quote.id,
        kind: "quote_deposit",
      },
    });

    await updateDb((d) => {
      const q = (d.quotes || []).find((x) => x.id === quote.id);
      if (q) {
        q.stripe_deposit_session_id = session.id;
        q.updated_at = new Date().toISOString();
      }
    });

    return NextResponse.json({ url: session.url });
  }

  // Demo / no Stripe: mark deposit paid locally
  await markQuoteDepositPaid({ quoteId: quote.id, stripeSessionId: null });
  return NextResponse.json({
    demo: true,
    quote_id: quote.id,
    status: "deposit_paid",
  });
}
