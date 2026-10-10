import { NextResponse } from "next/server";
import { aiPaused } from "@/lib/channels/inbound";
import { isAdminAuthenticated } from "@/lib/auth";
import { reportError } from "@/lib/monitor";
import { sendSms, smsConfigured, toE164 } from "@/lib/sms";
import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { ChannelThread } from "@/lib/types";

export const runtime = "nodejs";

/** After a manager replies, AI Yogi stays quiet on that conversation this long. */
const AI_PAUSE_MS = 12 * 60 * 60 * 1000;

export type DeskTextThread = {
  id: string;
  phone: string;
  name: string;
  unread: number;
  ai_on: boolean;
  opted_out: boolean;
  updated_at: string;
  messages: { id: string; role: string; content: string; created_at: string; status?: string }[];
};

function toDesk(t: ChannelThread): DeskTextThread {
  return {
    id: t.id,
    phone: t.lead_phone || `+${t.external_id}`,
    name: t.lead_name || "",
    unread: t.unread || 0,
    ai_on: !aiPaused(t),
    opted_out: Boolean(t.sms_opted_out),
    updated_at: t.updated_at,
    messages: t.messages.slice(-200).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      status: typeof m.meta?.sms_status === "string" ? m.meta.sms_status : undefined,
    })),
  };
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const threads = (db.channel_threads || [])
    .filter((t) => t.channel === "sms")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 100)
    .map(toDesk);
  return NextResponse.json({ threads, sms_ready: smsConfigured() });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    thread_id?: string;
    text?: string;
    phone?: string;
    on?: boolean;
  };

  if (body.action === "read" || body.action === "ai") {
    await updateDb((d) => {
      const t = (d.channel_threads || []).find((x) => x.id === body.thread_id);
      if (!t) return;
      if (body.action === "read") t.unread = 0;
      else t.ai_paused_until = body.on ? null : new Date(Date.now() + 365 * 86400000).toISOString();
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reply" || body.action === "new") {
    const text = String(body.text || "").trim();
    if (!text) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
    if (text.length > 1500) {
      return NextResponse.json({ error: "Keep texts under 1500 characters." }, { status: 400 });
    }

    let to = "";
    const threads = (await getDb()).channel_threads || [];
    if (body.action === "reply") {
      const thread = threads.find((x) => x.id === body.thread_id);
      if (!thread) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      to = thread.lead_phone || `+${thread.external_id}`;
    } else {
      to = toE164(String(body.phone || "")) || "";
      if (!to) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }
    const optedOut = threads.some(
      (x) => x.channel === "sms" && x.external_id === to.replace(/\D/g, "") && x.sms_opted_out
    );
    if (optedOut) {
      return NextResponse.json(
        { error: "This customer replied STOP. You can't text them unless they text START." },
        { status: 409 }
      );
    }

    const sent = await sendSms(to, text);
    if (!sent.ok) {
      await reportError("sms-send", sent.error, { to, source: "desk" });
      return NextResponse.json({ error: `Text not sent: ${sent.error}` }, { status: 502 });
    }

    const now = new Date().toISOString();
    const externalId = to.replace(/\D/g, "");
    let threadId = body.thread_id || "";
    await updateDb((d) => {
      d.channel_threads = d.channel_threads || [];
      let t = d.channel_threads.find((x) =>
        body.action === "reply" ? x.id === body.thread_id : x.channel === "sms" && x.external_id === externalId
      );
      if (!t) {
        t = {
          id: uid("thread"),
          channel: "sms",
          external_id: externalId,
          lead_name: "",
          lead_email: "",
          lead_phone: to,
          messages: [],
          status: "open",
          created_at: now,
          updated_at: now,
        };
        d.channel_threads.unshift(t);
      }
      t.messages.push({
        id: uid("msg"),
        role: "manager",
        content: text,
        created_at: now,
        meta: { sms_sid: sent.sid, sms_status: "sent" },
      });
      t.unread = 0;
      t.updated_at = now;
      const pauseUntil = new Date(Date.now() + AI_PAUSE_MS).toISOString();
      if (!t.ai_paused_until || t.ai_paused_until < pauseUntil) t.ai_paused_until = pauseUntil;
      threadId = t.id;
    });
    return NextResponse.json({ ok: true, thread_id: threadId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
