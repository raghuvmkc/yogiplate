import { proposalFromLatestPlan } from "@/lib/chat/planned-menu";
import type { CartProposal, OrderDraft } from "@/lib/chat/order-draft";
import { isFullDeliveryAddress } from "@/lib/geocode";
import {
  createQuote,
  deliverQuoteToGuest,
  publicQuoteUrl,
} from "@/lib/quotes";
import { notifyManagersOfHumanRequest } from "@/lib/handoff";
import { handoffTeamPhrase } from "@/lib/people";
import type { ContactChannel } from "@/lib/types";

export type FollowthroughAction =
  | "create_quote"
  | "send_quote"
  | "quote_status"
  | "request_human";

export type FollowthroughInput = {
  action: FollowthroughAction;
  quote_id?: string;
  send_email?: boolean;
  send_sms?: boolean;
  tier_note?: string;
  reason?: string;
};

export type FollowthroughContext = {
  lead: { name: string; email: string; phone: string };
  draft: OrderDraft;
  cartProposal: CartProposal | null;
  channel?: ContactChannel;
  chat_session_id?: string;
  lastQuoteId?: string | null;
  setLastQuoteId?: (id: string) => void;
  messages?: { role: string; content: string }[];
  quoteUrl?: string | null;
};

function deliverySummary(d: {
  email_sent: boolean;
  email_reason?: string;
  sms_sent: boolean;
  sms_reason?: string;
}) {
  const bits: string[] = [];
  if (d.email_sent) bits.push("emailed");
  else if (d.email_reason && d.email_reason !== "skipped")
    bits.push(`email failed (${d.email_reason})`);
  if (d.sms_sent) bits.push("texted");
  else if (d.sms_reason && d.sms_reason !== "skipped")
    bits.push(`SMS failed (${d.sms_reason})`);
  return bits.length ? bits.join(" + ") : "could not deliver";
}

export async function runFollowthroughTool(
  input: FollowthroughInput,
  ctx: FollowthroughContext
) {
  const action = input.action || "create_quote";

  if (action === "create_quote") {
    let proposal = ctx.cartProposal;
    const planned = ctx.chat_session_id
      ? await proposalFromLatestPlan({
          session_id: ctx.chat_session_id,
          customer_email: ctx.lead.email,
        })
      : null;
    if (planned?.items.length) proposal = planned;
    if (!proposal?.items?.length) {
      return {
        ok: false,
        tool: "followthrough",
        error: "no_cart_proposal",
        summary:
          "Call build_plan first so every requested dish is on the quotation.",
      };
    }
    if (!ctx.lead.email || !ctx.lead.name) {
      return {
        ok: false,
        tool: "followthrough",
        error: "missing_lead",
        summary: "Need guest name and email before creating a quote.",
      };
    }
    if (
      ctx.draft.delivery_or_pickup !== "pickup" &&
      !isFullDeliveryAddress(ctx.draft.address)
    ) {
      return {
        ok: false,
        tool: "followthrough",
        error: "incomplete_address",
        summary:
          "Need the full delivery address before sending the quotation: house or building number, street, city, and ZIP. A city name is not enough. Ask the guest, then store it with order_draft address.",
      };
    }

    const { quote, url } = await createQuote({
      lead: ctx.lead,
      draft: ctx.draft,
      proposal,
      channel: ctx.channel || "web_chat",
      chat_session_id: ctx.chat_session_id,
      // Deliver via deliverQuoteToGuest so email+SMS both run with SMTP fallback
      send_email: false,
    });
    ctx.setLastQuoteId?.(quote.id);

    const delivery = await deliverQuoteToGuest(quote.id, {
      email: input.send_email !== false,
      sms: input.send_sms !== false,
    });

    return {
      ok: true,
      tool: "followthrough",
      action,
      quote_id: quote.id,
      quote_number: quote.quote_number,
      food_subtotal: quote.food_subtotal,
      deposit_percent: quote.deposit_percent,
      deposit_amount: quote.deposit_amount,
      quote_url: url,
      email_sent: delivery.email_sent,
      email_reason: delivery.email_reason,
      sms_sent: delivery.sms_sent,
      sms_reason: delivery.sms_reason,
      item_count: quote.items.length,
      summary: `Quote ${quote.quote_number} includes all ${quote.items.length} dishes (${quote.deposit_percent}% deposit $${quote.deposit_amount}). Delivery to guest: ${deliverySummary(delivery)}. Tell the guest you emailed the quotation. Do not include the link, localhost, or any web address in the reply — the chat shows a button. Do not say a shorter menu was sent.`,
    };
  }

  if (action === "send_quote") {
    const id = input.quote_id || ctx.lastQuoteId;
    if (!id) {
      return {
        ok: false,
        tool: "followthrough",
        error: "no_quote_id",
        summary: "No quote_id — create_quote first.",
      };
    }
    const delivery = await deliverQuoteToGuest(id, {
      email: input.send_email !== false,
      sms: input.send_sms !== false,
    });
    return {
      ok: delivery.ok,
      tool: "followthrough",
      action,
      quote_id: id,
      email_sent: delivery.email_sent,
      email_reason: delivery.email_reason,
      sms_sent: delivery.sms_sent,
      sms_reason: delivery.sms_reason,
      quote_url: (await publicQuoteUrlFromId(id)) || undefined,
      summary: delivery.ok
        ? `Quote resent to guest (${deliverySummary(delivery)}).`
        : `Could not send quote (${deliverySummary(delivery)}). Tell the guest to use the quote button in the chat. Do not read a web address.`,
    };
  }

  if (action === "quote_status") {
    const { getQuote } = await import("@/lib/quotes");
    const id = input.quote_id || ctx.lastQuoteId;
    if (!id) {
      return {
        ok: false,
        tool: "followthrough",
        error: "no_quote_id",
        summary: "No quote yet.",
      };
    }
    const quote = await getQuote(id);
    if (!quote) {
      return { ok: false, tool: "followthrough", error: "not_found", summary: "Quote not found." };
    }
    return {
      ok: true,
      tool: "followthrough",
      action,
      quote_id: quote.id,
      status: quote.status,
      deposit_paid_at: quote.deposit_paid_at,
      quote_url: publicQuoteUrl(quote),
      summary: `Quote ${quote.quote_number} is ${quote.status}. Link: ${publicQuoteUrl(quote)}`,
    };
  }

  if (action === "request_human") {
    const transcript = (ctx.messages || [])
      .filter((m) => m.content?.trim())
      .slice(-40)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, 2000),
      }));
    const summary =
      String(input.reason || "").trim() ||
      [
        ctx.draft.occasion ? `Occasion: ${ctx.draft.occasion}` : null,
        ctx.draft.event_date ? `Date: ${ctx.draft.event_date}` : null,
        ctx.draft.adults || ctx.draft.kids
          ? `Guests: ${(ctx.draft.adults || 0) + (ctx.draft.kids || 0)}`
          : null,
        ctx.draft.diet ? `Diet: ${ctx.draft.diet}` : null,
        ctx.draft.city || ctx.draft.address
          ? `Location: ${[ctx.draft.address, ctx.draft.city].filter(Boolean).join(", ")}`
          : null,
        "Guest asked to speak with a person.",
      ]
        .filter(Boolean)
        .join(" · ");

    const result = await notifyManagersOfHumanRequest({
      name: ctx.lead.name,
      phone: ctx.lead.phone,
      email: ctx.lead.email,
      summary,
      transcript,
      orderDraft: ctx.draft as unknown as Record<string, unknown>,
      quoteUrl: ctx.quoteUrl || null,
    });

    return {
      ok: result.ok,
      tool: "followthrough",
      action,
      email_sent: result.email_sent,
      sms_sent: result.sms_sent,
      summary: `${result.summary} Reply naturally: confirm details were shared with ${handoffTeamPhrase()}; they will contact the guest shortly; then ask if you can still help now (build order or send a quote). Do not invent a phone number.`,
    };
  }

  return { ok: false, error: "Unknown followthrough action" };
}

async function publicQuoteUrlFromId(id: string) {
  const { getQuote } = await import("@/lib/quotes");
  const q = await getQuote(id);
  return q ? publicQuoteUrl(q) : null;
}
