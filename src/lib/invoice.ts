import { Resend } from "resend";
import { STATEMENT_NOTE, payBlockHtml } from "@/lib/pay-email";
import { formatMoney } from "@/lib/pricing";
import { prettyTime as formatEventTime } from "@/lib/quote-format";
import { sendGuestQuoteSmtp, smtpConfigured } from "@/lib/smtp";
import { getDb, updateDb } from "@/lib/store/local-db";
import type { Order, OrderItem, SiteSettings } from "@/lib/types";

export function buildInvoiceHtml(
  order: Order,
  items: OrderItem[],
  settings: SiteSettings,
  invoiceNumber: string,
  payUrl?: string | null,
  opts?: { paidLabel?: string | null; amountDue?: number; payCaption?: string }
) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">${i.name}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">${formatMoney(i.unit_price)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">${formatMoney(i.line_total)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;color:#1c1c1c;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
    <h1 style="font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;">Yogiplate</h1>
    <p style="margin:0 0 28px;color:#4a6b52;font-family:Arial,sans-serif;font-size:14px;">Pure vegetarian catering · Bay Area</p>
    <h2 style="font-size:20px;margin:0 0 8px;">Invoice ${invoiceNumber}</h2>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;margin:0 0 24px;">
      Order ${order.order_number}<br/>
      ${order.customer_name} · ${order.customer_email}<br/>
      Event: ${order.event_date}${order.event_time ? ` at ${formatEventTime(order.event_time)}` : ""} · ${order.guest_count} guests · ${order.diet_profile}<br/>
      Deliver to: ${order.delivery_address}, ${order.delivery_city}, ${order.delivery_state} ${order.delivery_zip}
    </p>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding-bottom:8px;">Item</th>
          <th style="text-align:center;padding-bottom:8px;">Qty</th>
          <th style="text-align:right;padding-bottom:8px;">Price</th>
          <th style="text-align:right;padding-bottom:8px;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px;text-align:right;">
      <p>Subtotal: ${formatMoney(order.subtotal)}</p>
      <p>Delivery (${order.delivery_miles} mi): ${formatMoney(order.delivery_fee)}</p>
      ${order.discount > 0 ? `<p>Discount${order.coupon_code ? ` (${order.coupon_code})` : ""}: −${formatMoney(order.discount)}</p>` : ""}
      <p>Tax: ${formatMoney(order.tax)}</p>
      <p style="font-size:18px;font-weight:700;margin-top:12px;">Total: ${formatMoney(order.total)}</p>
    </div>
    ${
      opts?.paidLabel
        ? `<p style="margin-top:28px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#2a4a36;">${opts.paidLabel}</p><p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Order ${order.order_number}</p>`
        : ""
    }
    ${
      payUrl && opts?.paidLabel !== "Paid in full"
        ? payBlockHtml({
            url: payUrl,
            amountLabel: formatMoney(
              opts?.amountDue ?? Math.max(0, order.total - (order.amount_paid || 0))
            ),
            caption: opts?.payCaption,
            reference: `Invoice ${invoiceNumber} · Order ${order.order_number}`,
          })
        : ""
    }
    <p style="margin-top:36px;font-family:Arial,sans-serif;font-size:13px;color:#777;">
      Thank you for choosing ${settings.business_name}. We cook with pure, fresh ingredients — made for every vegetarian tradition in the Bay Area.
      <br/>${settings.business_email} · ${settings.business_phone}
    </p>
  </div>
</body>
</html>`;
}

export async function sendInvoiceEmail(input: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL || "Yogiplate <orders@yogiplate.com>";
  if (!key) {
    console.info("[invoice] Resend not configured — skipping email send", {
      to: input.to,
      subject: input.subject,
    });
    return { sent: false as const, reason: "resend_not_configured" };
  }
  const resend = new Resend(key);
  await resend.emails.send({
    from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject,
    html: input.html,
  });
  return { sent: true as const };
}

export function buildPaymentConfirmationHtml(input: {
  name: string;
  orderNumber: string;
  invoiceNumber: string;
  eventDate: string;
  amountLabel: string;
  deposit: boolean;
}) {
  const safeName = input.name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const lead = input.deposit
    ? `We received your deposit of ${input.amountLabel} for order ${input.orderNumber}.`
    : `We received your payment of ${input.amountLabel} for order ${input.orderNumber}.`;
  const next = input.deposit
    ? "Your event is confirmed on our calendar. We will follow up on the remaining balance."
    : "Your event is confirmed on our calendar, and your invoice is marked paid.";
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;color:#1c1c1c;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
    <h1 style="font-size:32px;margin:0 0 4px;">Yogiplate</h1>
    <p style="margin:0 0 28px;color:#4a6b52;font-family:Arial,sans-serif;font-size:14px;">Payment confirmation</p>
    <p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;">Dear ${safeName},</p>
    <p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;">${lead}</p>
    <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">
      Invoice ${input.invoiceNumber}<br/>
      Event: ${input.eventDate || "to be confirmed"}
    </p>
    <p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;">${next}</p>
    <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#555;">${STATEMENT_NOTE}</p>
    <p style="margin-top:28px;font-family:Arial,sans-serif;font-size:14px;color:#555;">Thank you for choosing Yogiplate.</p>
  </div>
</body>
</html>`;
}

/** Email the guest once after Stripe marks the payment paid. */
export async function emailPaymentReceived(
  orderId: string,
  opts?: { depositAmount?: number }
) {
  try {
    const db = await getDb();
    const order = db.orders.find((row) => row.id === orderId);
    if (!order?.customer_email || order.payment_email_sent_at) return { sent: false as const };
    const invoice = db.invoices.find((row) => row.order_id === order.id);
    const deposit = opts?.depositAmount != null;
    const amount = deposit ? opts.depositAmount! : order.total;
    const amountLabel = formatMoney(amount);
    const html = buildPaymentConfirmationHtml({
      name: order.customer_name || "Guest",
      orderNumber: order.order_number,
      invoiceNumber: invoice?.invoice_number || "",
      eventDate: order.event_time
        ? `${order.event_date} at ${formatEventTime(order.event_time)}`
        : order.event_date,
      amountLabel,
      deposit,
    });
    const subject = deposit
      ? `Deposit received — Order ${order.order_number}`
      : `Payment received — Order ${order.order_number}`;
    const text = `${subject}. ${amountLabel}. Invoice ${invoice?.invoice_number || ""}. Event ${order.event_date}.`;
    let sent = false;
    try {
      const resend = await sendInvoiceEmail({
        to: order.customer_email,
        subject,
        html,
      });
      sent = resend.sent;
    } catch (err) {
      console.error("[payment] resend confirmation failed", err);
    }
    if (!sent && smtpConfigured()) {
      await sendGuestQuoteSmtp({
        to: order.customer_email,
        name: order.customer_name,
        subject,
        html,
        text,
      });
      sent = true;
    }
    if (!sent) return { sent: false as const };
    await updateDb((next) => {
      const row = next.orders.find((item) => item.id === orderId);
      if (row) row.payment_email_sent_at = new Date().toISOString();
    });
    return { sent: true as const };
  } catch (err) {
    console.error("[payment] confirmation email failed", err);
    return { sent: false as const };
  }
}
