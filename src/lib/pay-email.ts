import { siteUrl } from "@/lib/site";

/** Logo for emails: absolute URL to a small PNG, since mail apps cannot load relative or SVG/WebP images. */
export function emailLogoHtml(size = 96) {
  return `<img src="${siteUrl()}/images/yogiplate-logo-email.png" width="${size}" height="${size}" alt="Yogiplate" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;" />`;
}

/** Must match the statement descriptor on the Stone Craft Stripe account. */
export const STATEMENT_NAME = "STONE CRAFT PIZZA";

/** Wallets turned on in the Stone Craft Stripe dashboard. */
export const PAY_METHODS = ["Credit / debit card", "Apple Pay", "Link"];

export const STATEMENT_NOTE = `Payments are processed securely by Stripe through our partner kitchen, Stone Craft Pizza. The charge will appear on your statement as ${STATEMENT_NAME}.`;

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Email-safe pay card: big button, accepted methods, statement name, plain-link fallback. */
export function payBlockHtml(input: {
  url: string;
  amountLabel: string;
  caption?: string;
  reference?: string;
}) {
  const href = escapeAttr(input.url);
  const methods = PAY_METHODS.map(
    (m) =>
      `<span style="display:inline-block;margin:3px 3px;padding:5px 10px;border:1px solid #d9cfb8;border-radius:999px;background:#ffffff;font-size:12px;color:#3d4a42;white-space:nowrap;">${m}</span>`
  ).join("");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 8px;border-collapse:separate;">
  <tr><td style="background:#f7f3ea;border:1px solid #e6dcc6;border-radius:14px;padding:28px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8a6d2f;">${input.caption || "Amount due"}</p>
    <p style="margin:6px 0 20px;font-family:Georgia,serif;font-size:34px;line-height:1.1;color:#1e3d2f;">${input.amountLabel}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr><td bgcolor="#1e3d2f" style="border-radius:999px;background:#1e3d2f;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:16px 40px;border-radius:999px;font-size:16px;font-weight:700;letter-spacing:0.03em;color:#fffdf8;text-decoration:none;">Pay ${input.amountLabel} securely &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:18px 0 4px;font-size:12px;color:#6b6b6b;">Pay in a few taps with</p>
    <div style="margin:0 0 16px;">${methods}</div>
    <p style="margin:0 auto;max-width:440px;font-size:12px;line-height:1.6;color:#5c5c5c;">&#128274; ${STATEMENT_NOTE}</p>
    ${input.reference ? `<p style="margin:12px 0 0;font-size:12px;color:#8a8a8a;">${input.reference}</p>` : ""}
  </td></tr>
</table>
<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a8a8a;text-align:center;">
  Button not working? Copy this link into your browser:<br/>
  <a href="${href}" style="color:#1e3d2f;word-break:break-all;">${href}</a>
</p>`;
}
