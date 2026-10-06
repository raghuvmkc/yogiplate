import { NextResponse } from "next/server";
import {
  ensureQuotePaymentRecord,
  getQuoteByToken,
  markQuoteDepositPaid,
} from "@/lib/quotes";
import { stripeConfigured } from "@/lib/stripe";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import { siteUrl } from "@/lib/site";
import { buildInvoiceHtml } from "@/lib/invoice";
import { getDb, updateDb } from "@/lib/store/local-db";

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
    const linked = await ensureQuotePaymentRecord(quote.id);
    const session = await createCateringPaymentLink({
      customer_email: quote.customer_email,
      amount: quote.deposit_amount,
      product_name: `Yogiplate deposit — ${linked.order.order_number}`,
      description: `Order ${linked.order.order_number}. Deposit (${quote.deposit_percent}%) for event ${quote.event_date || "TBD"}`,
      success_url: `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}&deposit=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`,
      order_id: linked.order.id,
      order_number: linked.order.order_number,
      invoice_number: linked.invoice.invoice_number,
      kind: "quote_deposit",
      extra: { quote_id: quote.id },
    });

    const db = await getDb();
    const items = db.order_items.filter((row) => row.order_id === linked.order.id);
    const html = buildInvoiceHtml(
      linked.order,
      items,
      db.settings,
      linked.invoice.invoice_number,
      session.url
    );
    await updateDb((d) => {
      const q = (d.quotes || []).find((x) => x.id === quote.id);
      if (q) {
        q.order_id = linked.order.id;
        q.stripe_deposit_session_id = session.id;
        q.updated_at = new Date().toISOString();
      }
      const inv = d.invoices.find((row) => row.id === linked.invoice.id);
      if (inv && session.url) inv.html = html;
      const order = d.orders.find((row) => row.id === linked.order.id);
      if (order) order.stripe_session_id = session.id;
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
