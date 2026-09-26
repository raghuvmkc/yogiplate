import type { CartProposal, OrderDraft } from "@/lib/chat/order-draft";
import { createQuote, emailQuote, publicQuoteUrl } from "@/lib/quotes";
import type { ContactChannel } from "@/lib/types";

export type FollowthroughAction = "create_quote" | "send_quote" | "quote_status";

export type FollowthroughInput = {
  action: FollowthroughAction;
  quote_id?: string;
  send_email?: boolean;
  tier_note?: string;
};

export type FollowthroughContext = {
  lead: { name: string; email: string; phone: string };
  draft: OrderDraft;
  cartProposal: CartProposal | null;
  channel?: ContactChannel;
  chat_session_id?: string;
  lastQuoteId?: string | null;
  setLastQuoteId?: (id: string) => void;
};

export async function runFollowthroughTool(
  input: FollowthroughInput,
  ctx: FollowthroughContext
) {
  const action = input.action || "create_quote";

  if (action === "create_quote") {
    if (!ctx.cartProposal?.items?.length) {
      return {
        ok: false,
        tool: "followthrough",
        error: "no_cart_proposal",
        summary:
          "Call order_draft propose_cart first so there are menu lines to quote.",
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

    const { quote, url, email } = await createQuote({
      lead: ctx.lead,
      draft: ctx.draft,
      proposal: ctx.cartProposal,
      channel: ctx.channel || "web_chat",
      chat_session_id: ctx.chat_session_id,
      send_email: input.send_email !== false,
    });
    ctx.setLastQuoteId?.(quote.id);

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
      email_sent: email.sent,
      email_reason: email.reason,
      summary: `Quote ${quote.quote_number} ready (${quote.deposit_percent}% deposit $${quote.deposit_amount}). Share this link with the guest: ${url}${
        email.sent ? " Email sent." : email.reason ? ` Email not sent (${email.reason}).` : ""
      } Day-before and follow-up reminders were scheduled when an event date is known.`,
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
    const email = await emailQuote(id);
    return {
      ok: email.sent,
      tool: "followthrough",
      action,
      quote_id: id,
      email_sent: email.sent,
      email_reason: "reason" in email ? email.reason : undefined,
      summary: email.sent
        ? `Quote email resent for ${id}.`
        : `Could not email quote (${"reason" in email ? email.reason : "failed"}). Share the quote link instead.`,
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

  return { ok: false, error: "Unknown followthrough action" };
}
