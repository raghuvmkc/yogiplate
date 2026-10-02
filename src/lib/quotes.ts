import { sendInvoiceEmail } from "@/lib/invoice";
import { formatMoney, round2 } from "@/lib/pricing";
import { scheduleQuoteReminders } from "@/lib/reminders";
import { upsertCustomerFromLead } from "@/lib/crm";
import { composeQuoteClosing } from "@/lib/quote-closing";
import {
  buildQuoteEmailHtml,
  buildQuoteEmailText,
} from "@/lib/quote-email";
import { isFullDeliveryAddress } from "@/lib/geocode";
import { occasionFromNotes } from "@/lib/quote-format";
import { publicQuoteUrl } from "@/lib/site";
import {
  managerNotifyEmails,
  sendGuestQuoteSmtp,
  smtpConfigured,
} from "@/lib/smtp";
import { sendSms, smsConfigured } from "@/lib/sms";
import { upsertCateringBooking } from "@/lib/calendar-bookings";
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
    address: isFullDeliveryAddress(input.draft.address || "")
      ? input.draft.address
      : null,
    setup_needs: input.draft.setup_needs || null,
    special_requirements: input.draft.special_requirements || null,
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
    await upsertCateringBooking({
      event_date: quote.event_date,
      event_time: quote.event_time,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      chat_session_id: quote.chat_session_id,
      quote_id: quote.id,
      draft: input.draft,
      items_summary: quote.items
        .map((i) => `${i.quantity}× ${i.name}`)
        .join("; "),
      food_subtotal: quote.food_subtotal,
      status: "unconfirmed",
    }).catch(() => null);
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

function quoteCc(guestEmail: string) {
  const guest = guestEmail.trim().toLowerCase();
  return managerNotifyEmails().filter((e) => e !== guest);
}

/** Fill special requests, occasion, and the closing wish before the quotation is shown or sent. */
export async function prepareQuotePresentation(quote: Quote): Promise<Quote> {
  const db = await getDb();
  const booking = (db.catering_bookings || []).find(
    (b) => b.quote_id === quote.id
  );
  const special =
    quote.special_requirements || booking?.special_requirements || null;
  const setup = quote.setup_needs || booking?.setup_needs || null;
  const occasion =
    quote.occasion ||
    occasionFromNotes(quote.notes) ||
    booking?.occasion ||
    null;
  const address =
    [quote.address, booking?.address].find((value) =>
      isFullDeliveryAddress(String(value || ""))
    ) || null;
  const eventTime = quote.event_time || booking?.event_time || null;
  let closing = String(quote.closing_message || "").trim();
  if (!closing) {
    closing = await composeQuoteClosing({
      customerName: quote.customer_name,
      occasion,
      meal: quote.meal,
      guestCount: quote.guest_count,
      eventDate: quote.event_date,
      city: quote.city,
      diet: quote.diet_profile,
    });
  }
  const next: Quote = {
    ...quote,
    special_requirements: special,
    setup_needs: setup,
    occasion,
    address,
    event_time: eventTime,
    closing_message: closing,
  };
  const changed =
    next.special_requirements !== quote.special_requirements ||
    next.setup_needs !== quote.setup_needs ||
    next.occasion !== quote.occasion ||
    next.address !== quote.address ||
    next.event_time !== quote.event_time ||
    next.closing_message !== quote.closing_message;
  if (changed) {
    await updateDb((d) => {
      const q = (d.quotes || []).find((x) => x.id === quote.id);
      if (!q) return;
      q.special_requirements = next.special_requirements;
      q.setup_needs = next.setup_needs;
      q.occasion = next.occasion;
      q.address = next.address;
      q.event_time = next.event_time;
      q.closing_message = next.closing_message;
      q.updated_at = new Date().toISOString();
    });
  }
  return next;
}

export async function emailQuote(quoteId: string) {
  const existing = await getQuote(quoteId);
  if (!existing) return { sent: false as const, reason: "not_found" };
  if (!existing.customer_email) {
    return { sent: false as const, reason: "missing_email" };
  }
  const quote = await prepareQuotePresentation(existing);
  const db = await getDb();

  const subject = `Yogiplate catering quotation ${quote.quote_number}`;
  const emailCtx = {
    closing: quote.closing_message || "",
    businessPhone: db.settings.business_phone,
    businessEmail: db.settings.business_email,
  };
  const html = buildQuoteEmailHtml(quote, emailCtx);
  const text = buildQuoteEmailText(quote, emailCtx);
  const cc = quoteCc(quote.customer_email);

  let result: { sent: boolean; reason?: string } = await sendInvoiceEmail({
    to: quote.customer_email,
    cc,
    subject,
    html,
  });

  // Prefer Stone Craft SMTP when Resend is not configured
  if (!result.sent && smtpConfigured()) {
    try {
      await sendGuestQuoteSmtp({
        to: quote.customer_email,
        cc,
        name: quote.customer_name,
        subject,
        text,
        html,
      });
      result = { sent: true };
    } catch (e) {
      result = {
        sent: false,
        reason: e instanceof Error ? e.message : "smtp_failed",
      };
    }
  }

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

export async function smsQuote(quoteId: string) {
  const quote = await getQuote(quoteId);
  if (!quote) return { sent: false as const, reason: "not_found" };
  if (!smsConfigured()) {
    return { sent: false as const, reason: "twilio_not_configured" };
  }
  if (!quote.customer_phone) {
    return { sent: false as const, reason: "missing_phone" };
  }

  const url = publicQuoteUrl(quote);
  const body = [
    `Yogiplate catering quote ${quote.quote_number}`,
    `Hi ${quote.customer_name.split(" ")[0] || "there"},`,
    `Food estimate ${formatMoney(quote.food_subtotal)} · deposit ${formatMoney(quote.deposit_amount)}.`,
    `View & pay: ${url}`,
  ].join("\n");

  const result = await sendSms(quote.customer_phone, body);
  if (!result.ok) {
    return { sent: false as const, reason: result.error };
  }

  await updateDb((d) => {
    const q = (d.quotes || []).find((x) => x.id === quoteId);
    if (!q) return;
    q.updated_at = new Date().toISOString();
    if (q.status === "draft") q.status = "sent";
  });

  return { sent: true as const, to: result.to };
}

/** Email + SMS the quote to the guest. */
export async function deliverQuoteToGuest(
  quoteId: string,
  opts?: { email?: boolean; sms?: boolean }
) {
  const wantEmail = opts?.email !== false;
  const wantSms = opts?.sms !== false;
  const email = wantEmail
    ? await emailQuote(quoteId)
    : { sent: false as const, reason: "skipped" };
  const sms = wantSms
    ? await smsQuote(quoteId)
    : { sent: false as const, reason: "skipped" };
  return {
    ok: email.sent || sms.sent,
    email_sent: email.sent,
    email_reason: "reason" in email ? email.reason : undefined,
    sms_sent: sms.sent,
    sms_reason: "reason" in sms ? sms.reason : undefined,
  };
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
  const quote = await getQuote(input.quoteId);
  if (quote?.event_date) {
    await upsertCateringBooking({
      event_date: quote.event_date,
      event_time: quote.event_time,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      chat_session_id: quote.chat_session_id,
      quote_id: quote.id,
      draft: {
        event_date: quote.event_date,
        event_time: quote.event_time || "",
        diet: quote.diet_profile,
        occasion: quote.occasion || "",
        meal: (quote.meal as "lunch") || "",
        delivery_or_pickup: (quote.delivery_or_pickup as "delivery") || "",
        city: quote.city || "",
        address: quote.address || "",
        notes: quote.notes || "",
        adults: quote.guest_count || null,
        kids: null,
        budget: "",
        setup_needs: quote.setup_needs || "",
        special_requirements: quote.special_requirements || "",
        package_tier: "",
        confirmed: true,
      },
      items_summary: quote.items
        .map((i) => `${i.quantity}× ${i.name}`)
        .join("; "),
      food_subtotal: quote.food_subtotal,
      status: "confirmed",
    }).catch(() => null);
  }
  return quote;
}
