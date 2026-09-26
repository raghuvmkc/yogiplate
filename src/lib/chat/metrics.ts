import { getDb, updateDb } from "@/lib/store/local-db";
import type { ChatSessionLog, ContactChannel } from "@/lib/types";

export async function touchChatSession(input: {
  session_id: string;
  channel?: ContactChannel;
  lead_name?: string;
  lead_email?: string;
  lead_phone?: string;
  tools_used?: string[];
  skills_used?: string[];
  offered_whatsapp?: boolean;
  cart_proposal?: boolean;
  quote_created?: boolean;
  outcome?: ChatSessionLog["outcome"];
}) {
  const now = new Date().toISOString();
  await updateDb((d) => {
    d.chat_sessions = d.chat_sessions || [];
    let s = d.chat_sessions.find((x) => x.id === input.session_id);
    if (!s) {
      s = {
        id: input.session_id,
        started_at: now,
        updated_at: now,
        channel: input.channel || "web_chat",
        lead_name: input.lead_name || null,
        lead_email: input.lead_email || null,
        lead_phone: input.lead_phone || null,
        turn_count: 0,
        tools_used: [],
        skills_used: [],
        offered_whatsapp: false,
        cart_proposals: 0,
        quotes_created: 0,
        converted: false,
        outcome: "browsing",
      };
      d.chat_sessions.unshift(s);
    }
    s.updated_at = now;
    s.turn_count += 1;
    if (input.lead_name) s.lead_name = input.lead_name;
    if (input.lead_email) s.lead_email = input.lead_email;
    if (input.lead_phone) s.lead_phone = input.lead_phone;
    if (input.channel) s.channel = input.channel;
    for (const t of input.tools_used || []) {
      if (!s.tools_used.includes(t)) s.tools_used.push(t);
    }
    for (const sk of input.skills_used || []) {
      if (!s.skills_used.includes(sk)) s.skills_used.push(sk);
    }
    if (input.offered_whatsapp) s.offered_whatsapp = true;
    if (input.cart_proposal) s.cart_proposals += 1;
    if (input.quote_created) s.quotes_created += 1;
    if (input.outcome) s.outcome = input.outcome;
    else if (input.quote_created) s.outcome = "quote";
    else if (input.cart_proposal) s.outcome = "cart";
    else if (input.offered_whatsapp) s.outcome = "escalated";

    s.converted =
      s.quotes_created > 0 ||
      s.cart_proposals > 0 ||
      s.outcome === "ordered" ||
      s.outcome === "quote" ||
      s.outcome === "cart";
  });
}

export async function computeAgentMetrics() {
  const db = await getDb();
  const sessions = db.chat_sessions || [];
  const quotes = db.quotes || [];
  const reminders = db.reminders || [];
  const paidOrders = db.orders.filter((o) => o.status === "paid");
  const revenue = paidOrders.reduce((s, o) => s + o.total, 0);
  const aov = paidOrders.length ? revenue / paidOrders.length : 0;

  const converted = sessions.filter((s) => s.converted).length;
  const escalated = sessions.filter((s) => s.offered_whatsapp).length;
  const toolCounts: Record<string, number> = {};
  for (const s of sessions) {
    for (const t of s.tools_used) {
      toolCounts[t] = (toolCounts[t] || 0) + 1;
    }
  }

  const deposits = quotes.filter((q) => q.status === "deposit_paid").length;
  const quotesSent = quotes.filter(
    (q) => q.status === "sent" || q.status === "deposit_paid" || q.status === "accepted"
  ).length;

  return {
    sessions: sessions.length,
    turns: sessions.reduce((s, x) => s + x.turn_count, 0),
    conversion_rate: sessions.length ? converted / sessions.length : 0,
    escalations: escalated,
    escalation_rate: sessions.length ? escalated / sessions.length : 0,
    cart_proposals: sessions.reduce((s, x) => s + x.cart_proposals, 0),
    quotes_total: quotes.length,
    quotes_sent: quotesSent,
    deposits_paid: deposits,
    reminders_pending: reminders.filter((r) => r.status === "pending").length,
    reminders_sent: reminders.filter((r) => r.status === "sent").length,
    orders_paid: paidOrders.length,
    revenue,
    aov,
    tool_counts: toolCounts,
    recent_sessions: [...sessions]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 20),
  };
}
