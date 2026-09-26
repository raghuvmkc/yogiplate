import { sendInvoiceEmail } from "@/lib/invoice";
import { formatMoney, round2 } from "@/lib/pricing";
import { scheduleQuoteReminders } from "@/lib/reminders";
import { upsertCustomerFromLead } from "@/lib/crm";
import { publicQuoteUrl } from "@/lib/site";
import {
  getDb,
  quoteNumber,
  uid,
  updateDb,
} from "@/lib/store/local-db";
import type {
  CartProposal,
  OrderDraft,
} from "@/lib/chat/order-draft";
import type {
  ContactChannel,
  Quote,
  QuoteLine,
  QuoteStatus,
} from "@/lib/types";

export { publicQuoteUrl };

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function linesFromProposal(proposal: CartProposal): QuoteLine[] {
  return (proposal.items || []).map((i) => ({
    menu_item_id: i.menu_item_id,
    variant_id: i.variant_id,
    name: i.name,
    quantity: Math.max(1, i.quantity),
    unit_price: i.price,
    unit: i.unit || "tray",
  }));
}

export async function createQuote(input: {
  lead: {
    name: string;
    email: string;
    phone: string;
  };
  draft: OrderDraft;
  proposal: CartProposal;
  channel?: ContactChannel;
  chat_session_id?: string;
  send_email?: boolean;
}): Promise<{ quote: Quote; url: string; email: { sent: boolean; reason?: string } }> {
  const db = await getDb();
  const depositPercent = db.settings.deposit_percent ?? 30;
  const validity = db.settings.quote_validity_days ?? 7;
  const items = linesFromProposal(input.proposal);
  if (!items.length) {
    throw new Error("Quote needs at least one menu line from a cart proposal.");
  }
  const food_subtotal = round2(
    items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  );
  // Rough estimate: food + typical delivery floor; guest sees deposit on food estimate.
  const estimated_total = food_subtotal;
  const deposit_amount = round2((estimated_total * depositPercent) / 100);
  const now = new Date().toISOString();

  const customer = await upsertCustomerFromLead({
    name: input.lead.name,
    email: input.lead.email,
    phone: input.lead.phone,
    city: input.draft.city || undefined,
    channel: input.channel || "web_chat",
  });

  const quote: Quote = {
    id: uid("quote"),
    quote_number: quoteNumber(),
    status: "draft",
    customer_id: customer.id,
    customer_name: input.lead.name,
    customer_email: input.lead.email,
    customer_phone: input.lead.phone,
    diet_profile: String(input.draft.diet || input.proposal.diet || "pure_vegetarian"),
    event_date: input.draft.event_date || input.proposal.event_date || "",
    event_time: input.draft.event_time || null,
    guest_count:
      input.proposal.guest_count ||
      (input.draft.adults ?? 0) + (input.draft.kids ?? 0) ||
      0, // proposal headcount, else adults+kids
    occasion: input.draft.occasion || null,
    meal: input.draft.meal || null,
    delivery_or_pickup: input.draft.delivery_or_pickup || null,
    city: input.draft.city || null,
    address: input.draft.address || null,
    notes: [input.draft.notes, input.proposal.notes].filter(Boolean).join(" · ") || null,
    items,
    food_subtotal,
    estimated_total,
    deposit_percent: depositPercent,
    deposit_amount,
    public_token: uid("qt").replace("qt_", ""),
    chat_session_id: input.chat_session_id || null,
    channel: input.channel || "web_chat",
    expires_at: addDaysIso(validity),
    created_at: now,
    updated_at: now,
  };

  await updateDb((d) => {
    d.quotes = d.quotes || [];
    d.quotes.unshift(quote);
  });

  let emailResult: { sent: boolean; reason?: string } = {
    sent: false,
    reason: "not_requested",
  };
  if (input.send_email !== false) {
    emailResult = await emailQuote(quote.id);
  }

  if (quote.event_date) {
    await scheduleQuoteReminders(quote.id);
  }

  return { quote: (await getQuote(quote.id))!, url: publicQuoteUrl(quote), email: emailResult };
}

export async function getQuote(id: string): Promise<Quote | null> {
  const db = await getDb();
  return (db.quotes || []).find((q) => q.id === id) || null;
}

export async function getQuoteByToken(
  id: string,
  token: string
): Promise<Quote | null> {
  const q = await getQuote(id);
  if (!q || q.public_token !== token) return null;
  return q;
}

export async function listQuotes(): Promise<Quote[]> {
  const db = await getDb();
  return [...(db.quotes || [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export function buildQuoteEmailHtml(quote: Quote) {
  const url = publicQuoteUrl(quote);
  const rows = quote.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${i.name}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatMoney(i.unit_price * i.quantity)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fff;color:#1c1c1c;font-family:Georgia,serif;">
<div style="max-width:640px;margin:0 auto;padding:40px 24px;">
  <h1 style="font-size:28px;margin:0 0 4px;">Yogiplate</h1>
  <p style="margin:0 0 24px;color:#4a6b52;font-family:Arial,sans-serif;font-size:14px;">Catering quote ${quote.quote_number}</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#555;">
    Hi ${quote.customer_name},<br/><br/>
    Here is your proposed catering menu for
    <strong>${quote.event_date || "your event"}</strong>
    (${quote.guest_count || "TBD"} guests${quote.diet_profile ? ` · ${quote.diet_profile}` : ""}).
  </p>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin-top:20px;">
    <thead><tr>
      <th style="text-align:left;">Item</th>
      <th style="text-align:center;">Qty</th>
      <th style="text-align:right;">Line</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-family:Arial,sans-serif;font-size:16px;margin-top:20px;text-align:right;">
    Food estimate: <strong>${formatMoney(quote.food_subtotal)}</strong><br/>
    Deposit (${quote.deposit_percent}%): <strong>${formatMoney(quote.deposit_amount)}</strong>
  </p>
  <p style="font-family:Arial,sans-serif;margin-top:28px;">
    <a href="${url}" style="display:inline-block;background:#2a4a36;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600;">
      View quote &amp; pay deposit
    </a>
  </p>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#777;margin-top:28px;">
    Delivery and tax are confirmed at checkout. This quote expires ${new Date(quote.expires_at).toLocaleDateString()}.
  </p>
</div></body></html>`;
}

export async function emailQuote(quoteId: string) {
  const quote = await getQuote(quoteId);
  if (!quote) return { sent: false as const, reason: "not_found" };

  const result = await sendInvoiceEmail({
    to: quote.customer_email,
    subject: `Yogiplate catering quote ${quote.quote_number}`,
    html: buildQuoteEmailHtml(quote),
  });

  await updateDb((d) => {
    const q = (d.quotes || []).find((x) => x.id === quoteId);
    if (!q) return;
    q.updated_at = new Date().toISOString();
    if (result.sent) {
      q.email_sent_at = q.updated_at;
      if (q.status === "draft") q.status = "sent";
    }
  });

  return result.sent
    ? { sent: true as const }
    : { sent: false as const, reason: result.reason || "send_failed" };
}

export async function markQuoteDepositPaid(input: {
  quoteId: string;
  stripeSessionId?: string | null;
}) {
  await updateDb((d) => {
    const q = (d.quotes || []).find((x) => x.id === input.quoteId);
    if (!q) return;
    q.status = "deposit_paid" as QuoteStatus;
    q.deposit_paid_at = new Date().toISOString();
    q.stripe_deposit_session_id = input.stripeSessionId || null;
    q.updated_at = q.deposit_paid_at;
  });
  return getQuote(input.quoteId);
}
