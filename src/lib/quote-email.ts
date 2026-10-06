import { formatMoney, lineTotal } from "@/lib/pricing";
import { chefWithTitle, getYogiPeople } from "@/lib/people";
import {
  escHtml,
  prettyDate,
  prettyLabel,
  prettyTime,
  deliveryAddressLine,
  resolveOccasion,
  serviceLine,
} from "@/lib/quote-format";
import { siteUrl } from "@/lib/site";
import type { Quote } from "@/lib/types";

export type QuoteEmailContext = {
  closing: string;
  businessPhone?: string;
  businessEmail?: string;
};

function quoteIntro() {
  const name = getYogiPeople().chefName || "Radhavallabh";
  return `Thank you for inviting Yogiplate to your table. ${name} began this kitchen so no one would have to choose between food that tastes wonderful and food that is pure. Below is a quotation for your gathering, prepared with fresh ingredients and care.`;
}

function detailRow(label: string, value: string) {
  if (!value) return "";
  return `<tr>
    <td style="padding:7px 16px 7px 0;color:#6d6456;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${escHtml(label)}</td>
    <td style="padding:7px 0;color:#243028;font-size:15px;line-height:1.45;">${escHtml(value)}</td>
  </tr>`;
}

export function buildQuoteEmailHtml(quote: Quote, ctx: QuoteEmailContext) {
  const url = `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
  const logo = `${siteUrl()}/images/Yogiplate_Logo_transparent.png`;
  const when = [prettyDate(quote.event_date), prettyTime(quote.event_time)]
    .filter(Boolean)
    .join(" · ");
  const occasion = resolveOccasion(quote);
  const service = serviceLine(quote);
  const special = String(quote.special_requirements || "").trim();
  const setup = String(quote.setup_needs || "").trim();
  const specialText = [special, setup && setup !== special ? `Setup: ${setup}` : ""]
    .filter(Boolean)
    .join("\n");
  const expires = quote.expires_at
    ? new Date(quote.expires_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const rows = quote.items
    .map((i, idx) => {
      const bg = idx % 2 === 0 ? "#fffdf8" : "#f7f3ea";
      return `<tr style="background:${bg};">
        <td style="padding:12px 10px;border-bottom:1px solid #efe6d4;color:#243028;">${escHtml(i.name)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #efe6d4;text-align:center;color:#243028;">${i.quantity}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #efe6d4;text-align:center;color:#6d6456;font-size:13px;">${escHtml(prettyLabel(i.unit) || "Tray")}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #efe6d4;text-align:right;color:#243028;">${formatMoney(lineTotal(i.unit_price, i.quantity))}</td>
      </tr>`;
    })
    .join("");

  const phone = ctx.businessPhone || "";
  const email = ctx.businessEmail || "";
  const contact = [phone, email].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3efe6;">
  <div style="display:none;max-height:0;overflow:hidden;color:#f3efe6;">
    Your Yogiplate catering quotation ${escHtml(quote.quote_number)} is ready.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fffdf8;border:1px solid #e6dcc6;">
        <tr><td style="height:6px;background:#1e3d2f;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:28px 32px 8px;">
          <img src="${logo}" alt="Yogiplate" width="168" style="display:block;width:168px;max-width:168px;height:auto;border:0;" />
        </td></tr>
        <tr><td align="center" style="padding:4px 32px 0;font-family:Georgia,'Times New Roman',serif;color:#a8862a;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;">
          Catering quotation
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 0;font-family:Georgia,'Times New Roman',serif;color:#1e3d2f;font-size:28px;line-height:1.25;">
          Prepared for ${escHtml(quote.customer_name || "you")}
        </td></tr>
        <tr><td align="center" style="padding:6px 32px 18px;font-family:Arial,Helvetica,sans-serif;color:#6d6456;font-size:13px;">
          ${escHtml(quote.quote_number)}
        </td></tr>
        <tr><td style="padding:0 32px;">
          <div style="height:1px;background:#e6dcc6;font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:22px 32px 6px;font-family:Georgia,'Times New Roman',serif;color:#243028;font-size:16px;line-height:1.6;">
          Dear ${escHtml(quote.customer_name || "friend")},
        </td></tr>
        <tr><td style="padding:0 32px 8px;font-family:Georgia,'Times New Roman',serif;color:#3c463f;font-size:16px;line-height:1.65;">
          ${escHtml(quoteIntro())}
        </td></tr>
        <tr><td style="padding:8px 32px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
            ${detailRow("When", when)}
            ${detailRow("Guests", quote.guest_count ? String(quote.guest_count) : "")}
            ${detailRow("Occasion", occasion)}
            ${detailRow("Meal", prettyLabel(quote.meal))}
            ${detailRow("Diet", prettyLabel(quote.diet_profile))}
            ${detailRow("Service", service)}
            ${detailRow("Deliver to", deliveryAddressLine(quote))}
          </table>
        </td></tr>
        ${
          specialText
            ? `<tr><td style="padding:14px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f4;border-left:3px solid #1e3d2f;">
            <tr><td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;">
              <div style="color:#1e3d2f;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Special requests</div>
              <div style="margin-top:6px;color:#243028;font-size:14px;line-height:1.5;">${escHtml(specialText).replace(/\n/g, "<br/>")}</div>
            </td></tr>
          </table>
        </td></tr>`
            : ""
        }
        <tr><td style="padding:22px 32px 8px;font-family:Georgia,'Times New Roman',serif;color:#1e3d2f;font-size:20px;">
          Proposed menu
        </td></tr>
        <tr><td style="padding:0 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;border-collapse:collapse;">
            <thead>
              <tr>
                <th align="left" style="padding:8px 10px;border-bottom:2px solid #1e3d2f;color:#1e3d2f;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Dish</th>
                <th align="center" style="padding:8px;border-bottom:2px solid #1e3d2f;color:#1e3d2f;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Qty</th>
                <th align="center" style="padding:8px;border-bottom:2px solid #1e3d2f;color:#1e3d2f;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Unit</th>
                <th align="right" style="padding:8px 10px;border-bottom:2px solid #1e3d2f;color:#1e3d2f;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;" align="right">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#243028;line-height:1.7;">
            Food estimate&nbsp;&nbsp;<strong>${formatMoney(quote.food_subtotal)}</strong><br/>
            Deposit (${quote.deposit_percent}%)&nbsp;&nbsp;<strong style="color:#1e3d2f;">${formatMoney(quote.deposit_amount)}</strong>
          </div>
          <div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6d6456;">
            Delivery and tax are confirmed when the order is finalized.
          </div>
        </td></tr>
        <tr><td align="center" style="padding:22px 32px 8px;">
          <a href="${url}" style="display:inline-block;background:#1e3d2f;color:#fffdf8;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.04em;text-decoration:none;padding:14px 26px;">
            View quotation &amp; pay deposit
          </a>
        </td></tr>
        <tr><td style="padding:18px 32px 0;">
          <div style="height:1px;background:#e6dcc6;">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:18px 36px 6px;font-family:Georgia,'Times New Roman',serif;color:#1e3d2f;font-size:17px;line-height:1.65;font-style:italic;">
          ${escHtml(ctx.closing)}
        </td></tr>
        <tr><td style="padding:8px 36px 28px;font-family:Georgia,'Times New Roman',serif;color:#243028;font-size:15px;line-height:1.5;">
          With warmth,<br/>
          <strong>Yogiplate</strong><br/>
          <span style="color:#6d6456;font-size:13px;">${escHtml(chefWithTitle())}</span>
        </td></tr>
        <tr><td style="background:#1e3d2f;padding:16px 32px 18px;font-family:Arial,Helvetica,sans-serif;color:#e7efe9;font-size:12px;line-height:1.6;" align="center">
          ${expires ? `This quotation is valid through ${escHtml(expires)}.` : ""}
          ${contact ? `<br/>${escHtml(contact)}` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildQuoteEmailText(quote: Quote, ctx: QuoteEmailContext) {
  const url = `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
  const when = [prettyDate(quote.event_date), prettyTime(quote.event_time)]
    .filter(Boolean)
    .join(" · ");
  const lines = quote.items
    .map(
      (i) =>
        `- ${i.quantity}× ${i.name}: ${formatMoney(lineTotal(i.unit_price, i.quantity))}`
    )
    .join("\n");
  const occasion = resolveOccasion(quote);
  return [
    `Yogiplate catering quotation ${quote.quote_number}`,
    "",
    `Dear ${quote.customer_name},`,
    "",
    quoteIntro(),
    "",
    when ? `When: ${when}` : null,
    quote.guest_count ? `Guests: ${quote.guest_count}` : null,
    occasion ? `Occasion: ${occasion}` : null,
    quote.meal ? `Meal: ${prettyLabel(quote.meal)}` : null,
    quote.diet_profile ? `Diet: ${prettyLabel(quote.diet_profile)}` : null,
    serviceLine(quote) ? `Service: ${serviceLine(quote)}` : null,
    deliveryAddressLine(quote) ? `Deliver to: ${deliveryAddressLine(quote)}` : null,
    quote.special_requirements
      ? `Special requests: ${quote.special_requirements}`
      : null,
    quote.setup_needs ? `Setup: ${quote.setup_needs}` : null,
    "",
    "Proposed menu",
    lines,
    "",
    `Food estimate: ${formatMoney(quote.food_subtotal)}`,
    `Deposit (${quote.deposit_percent}%): ${formatMoney(quote.deposit_amount)}`,
    "",
    `View quotation & pay deposit: ${url}`,
    "",
    ctx.closing,
    "",
    "With warmth,",
    "Yogiplate",
    chefWithTitle(),
  ]
    .filter((line) => line != null)
    .join("\n");
}
