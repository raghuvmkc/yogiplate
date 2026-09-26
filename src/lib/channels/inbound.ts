import { runFrontDeskTurn } from "@/lib/chat/agent";
import { upsertCustomerFromLead } from "@/lib/crm";
import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { ChannelThread, ContactChannel } from "@/lib/types";

export type InboundPayload = {
  channel: ContactChannel;
  external_id: string;
  text: string;
  lead: {
    name?: string;
    email?: string;
    phone?: string;
  };
};

export async function handleChannelInbound(input: InboundPayload) {
  const text = input.text.trim();
  if (!text) {
    return { ok: false as const, error: "empty_message" };
  }

  const channel = input.channel;
  const externalId = input.external_id.trim() || uid("ext");
  const now = new Date().toISOString();

  let threadId = "";

  await updateDb((d) => {
    d.channel_threads = d.channel_threads || [];
    let t = d.channel_threads.find(
      (x) => x.channel === channel && x.external_id === externalId
    );
    if (!t) {
      t = {
        id: uid("thread"),
        channel,
        external_id: externalId,
        lead_name: input.lead.name || "",
        lead_email: input.lead.email || "",
        lead_phone: input.lead.phone || "",
        messages: [],
        status: "open",
        created_at: now,
        updated_at: now,
      };
      d.channel_threads.unshift(t);
    }
    if (input.lead.name) t.lead_name = input.lead.name;
    if (input.lead.email) t.lead_email = input.lead.email;
    if (input.lead.phone) t.lead_phone = input.lead.phone;
    t.messages.push({
      id: uid("msg"),
      role: "user",
      content: text,
      created_at: now,
    });
    t.updated_at = now;
    threadId = t.id;
  });

  const db = await getDb();
  const thread = (db.channel_threads || []).find((t) => t.id === threadId);
  if (!thread) return { ok: false as const, error: "thread_failed" };

  const leadName = thread.lead_name || "Guest";
  const leadEmail =
    thread.lead_email ||
    `${channel}.${externalId.replace(/\W/g, "").slice(0, 20)}@leads.yogiplate.local`;
  const leadPhone =
    thread.lead_phone && thread.lead_phone.replace(/\D/g, "").length >= 10
      ? thread.lead_phone
      : "5100000000";

  const customer = await upsertCustomerFromLead({
    name: leadName,
    email: leadEmail,
    phone: leadPhone,
    channel,
  });

  await updateDb((d) => {
    const t = (d.channel_threads || []).find((x) => x.id === threadId);
    if (t) t.customer_id = customer.id;
  });

  const history = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  if (!history.length || history[history.length - 1].content !== text) {
    history.push({ role: "user", content: text });
  }

  try {
    const result = await runFrontDeskTurn({
      messages: history,
      lead: {
        name: leadName,
        email: customer.email,
        phone: customer.phone,
      },
      session_id: `ch_${threadId}`,
      channel,
    });

    const replyAt = new Date().toISOString();
    await updateDb((d) => {
      const t = (d.channel_threads || []).find((x) => x.id === threadId);
      if (!t) return;
      t.messages.push({
        id: uid("msg"),
        role: "assistant",
        content: result.reply,
        created_at: replyAt,
        meta: {
          quote_url: result.quote_url,
          tools_used: result.tools_used,
        },
      });
      t.updated_at = replyAt;
    });

    return {
      ok: true as const,
      thread_id: threadId,
      reply: result.reply,
      quote_url: result.quote_url,
      tools_used: result.tools_used,
      customer_id: customer.id,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: detail, thread_id: threadId };
  }
}

export async function listChannelThreads(): Promise<ChannelThread[]> {
  const db = await getDb();
  return [...(db.channel_threads || [])].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );
}
