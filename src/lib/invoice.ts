import { Resend } from "resend";
import { formatMoney } from "@/lib/pricing";
import type { Order, OrderItem, SiteSettings } from "@/lib/types";

export function buildInvoiceHtml(
  order: Order,
  items: OrderItem[],
  settings: SiteSettings,
  invoiceNumber: string,
  payUrl?: string | null
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
      Event: ${order.event_date} · ${order.guest_count} guests · ${order.diet_profile}<br/>
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
      payUrl
        ? `<p style="margin-top:28px;font-family:Arial,sans-serif;font-size:15px;"><a href="${payUrl}" style="display:inline-block;background:#2a4a36;color:#ffffff;text-decoration:none;padding:12px 18px;">Pay this invoice</a></p>`
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
