"use client";

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquarePlus, Phone, Search, Send } from "lucide-react";

type TextMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  status?: string;
};

type TextThread = {
  id: string;
  phone: string;
  name: string;
  unread: number;
  ai_on: boolean;
  opted_out: boolean;
  updated_at: string;
  messages: TextMessage[];
};

const POLL_MS = 10_000;

function prettyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (us.length === 10) return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  return value;
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bubbleTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(thread: TextThread) {
  const parts = thread.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return thread.phone.replace(/\D/g, "").slice(-2);
}

function preview(thread: TextThread) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  const who = last.role === "manager" ? "You: " : last.role === "assistant" ? "AI Yogi: " : "";
  return who + last.content;
}

export function DeskTexts({
  visible,
  canCall,
  onCall,
  onUnreadChange,
}: {
  visible: boolean;
  canCall: boolean;
  onCall: (phone: string) => void;
  onUnreadChange: (count: number) => void;
}) {
  const [threads, setThreads] = useState<TextThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [smsReady, setSmsReady] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/texts", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { threads: TextThread[]; sms_ready: boolean };
    setThreads(data.threads || []);
    setSmsReady(data.sms_ready !== false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void load();
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [threads, selectedId]
  );

  useEffect(() => {
    const unread = threads.reduce(
      (sum, t) => sum + (visible && !composing && t.id === selectedId ? 0 : t.unread),
      0
    );
    onUnreadChange(unread);
  }, [threads, visible, composing, selectedId, onUnreadChange]);

  const markRead = useCallback((threadId: string) => {
    void fetch("/api/admin/texts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", thread_id: threadId }),
    });
  }, []);

  useEffect(() => {
    if (!visible || composing || !selected || selected.unread === 0) return;
    markRead(selected.id);
  }, [visible, composing, selected, markRead]);

  const messageCount = selected?.messages.length ?? 0;
  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, selectedId, messageCount]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    const digits = q.replace(/\D/g, "");
    return threads.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (digits && t.phone.replace(/\D/g, "").includes(digits)) ||
        t.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [threads, query]);

  function openThread(id: string) {
    setComposing(false);
    setSelectedId(id);
    setError(null);
    if (threads.find((t) => t.id === id)?.unread) markRead(id);
    setThreads((list) => list.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/texts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data as { thread_id?: string };
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = composing
        ? await post({ action: "new", phone: newPhone, text })
        : await post({ action: "reply", thread_id: selectedId, text });
      setDraft("");
      if (composing) {
        setComposing(false);
        setNewPhone("");
      }
      if (data.thread_id) setSelectedId(data.thread_id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text not sent.");
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    if (!selected) return;
    const on = !selected.ai_on;
    setThreads((list) => list.map((t) => (t.id === selected.id ? { ...t, ai_on: on } : t)));
    await post({ action: "ai", thread_id: selected.id, on }).catch(() => void load());
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (!visible) return null;

  const showThread = composing || selected;

  return (
    <div className="mt-5">
      {!smsReady ? (
        <p className="mb-3 border border-line bg-warm px-3 py-2 text-sm text-accent-deep">
          Texting is not set up yet. Add the Twilio account keys and number in the environment to send replies.
        </p>
      ) : null}
      <div className="grid h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-xl border border-line bg-white shadow-sm md:grid-cols-[20rem_1fr]">
        <div className={`${showThread ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-line bg-warm/60`}>
          <div className="flex items-center gap-2 border-b border-line p-3">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search texts"
                className="w-full rounded-full border border-line bg-white py-2 pl-8 pr-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setComposing(true);
                setSelectedId(null);
                setError(null);
              }}
              title="New text"
              aria-label="New text"
              className="rounded-full bg-accent-deep p-2 text-white hover:opacity-90"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {!loaded ? <li className="p-4 text-sm text-muted">Loading texts…</li> : null}
            {loaded && filtered.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted">
                {threads.length ? "No texts match." : "No texts yet. When a guest texts the store number it shows up here."}
              </li>
            ) : null}
            {filtered.map((t) => {
              const active = t.id === selectedId && !composing;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openThread(t.id)}
                    className={`flex w-full gap-3 border-b border-line/60 px-3 py-3 text-left transition ${
                      active ? "bg-white shadow-[inset_3px_0_0_var(--accent-deep)]" : "hover:bg-white/70"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-deep">
                      {initials(t)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${t.unread ? "font-bold" : "font-semibold"} text-foreground`}>
                          {t.name || prettyPhone(t.phone)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">{shortTime(t.updated_at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`line-clamp-1 flex-1 text-xs ${t.unread ? "text-foreground" : "text-muted"}`}>
                          {preview(t)}
                        </span>
                        {t.opted_out ? (
                          <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] font-semibold uppercase leading-4 text-muted">
                            Opted out
                          </span>
                        ) : null}
                        {t.unread ? (
                          <span className="min-w-5 rounded-full bg-[#c2410c] px-1.5 text-center text-[11px] font-bold leading-5 text-white">
                            {t.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${showThread ? "flex" : "hidden md:flex"} min-h-0 flex-col`}>
          {showThread ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false);
                    setSelectedId(null);
                  }}
                  className="text-sm font-semibold text-accent-deep md:hidden"
                >
                  ← Back
                </button>
                {composing ? (
                  <label className="flex flex-1 items-center gap-2 text-sm font-semibold text-foreground">
                    To
                    <input
                      autoFocus
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone number, e.g. 408 555 0100"
                      inputMode="tel"
                      className="flex-1 rounded-full border border-line px-3 py-1.5 text-sm font-normal"
                    />
                  </label>
                ) : selected ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">
                        {selected.name || prettyPhone(selected.phone)}
                      </p>
                      <p className="text-xs text-muted">{selected.name ? prettyPhone(selected.phone) : "Text message"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleAi()}
                      title={selected.ai_on ? "AI Yogi answers new texts automatically" : "AI Yogi is paused on this conversation"}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        selected.ai_on
                          ? "border-accent bg-accent-soft text-accent-deep"
                          : "border-line bg-white text-muted"
                      }`}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      AI auto-reply {selected.ai_on ? "on" : "off"}
                    </button>
                    <button
                      type="button"
                      disabled={!canCall}
                      onClick={() => onCall(selected.phone)}
                      title={canCall ? `Call ${prettyPhone(selected.phone)}` : "The desk phone is busy or not ready"}
                      className="inline-flex items-center gap-2 rounded-full bg-accent-deep px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Phone className="h-4 w-4" />
                      Call
                    </button>
                  </>
                ) : null}
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#faf8f3] px-4 py-5">
                {composing ? (
                  <p className="mt-10 text-center text-sm text-muted">
                    Start a new text conversation. Replies come back here.
                  </p>
                ) : (
                  selected?.messages
                    .filter((m) => m.role !== "system")
                    .map((m) => {
                      const guest = m.role === "user";
                      const ai = m.role === "assistant";
                      return (
                        <div key={m.id} className={`flex flex-col ${guest ? "items-start" : "items-end"}`}>
                          <div
                            className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                              guest
                                ? "rounded-bl-md border border-line bg-white text-foreground"
                                : ai
                                  ? "rounded-br-md border border-accent/30 bg-accent-soft text-foreground"
                                  : "rounded-br-md bg-accent-deep text-white"
                            }`}
                          >
                            {m.content}
                          </div>
                          <span className="mt-1 px-1 text-[11px] text-muted">
                            {guest ? "" : ai ? "AI Yogi · " : "You · "}
                            {bubbleTime(m.created_at)}
                            {m.status === "failed" ? <span className="font-semibold text-[#b42318]"> · Not delivered</span> : null}
                          </span>
                        </div>
                      );
                    })
                )}
              </div>

              <div className="border-t border-line bg-white p-3">
                {error ? <p className="mb-2 text-sm text-[#b42318]">{error}</p> : null}
                {selected && !composing && selected.opted_out ? (
                  <p className="mb-2 border border-line bg-warm px-3 py-2 text-xs font-medium text-foreground">
                    This customer replied STOP and has opted out of texts. You can still call them. Texting
                    reopens only if they text START.
                  </p>
                ) : selected && !composing && selected.ai_on ? (
                  <p className="mb-2 text-xs text-muted">
                    Replying here pauses AI Yogi on this conversation for 12 hours.
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKey}
                    rows={2}
                    maxLength={1500}
                    placeholder="Type a text message…"
                    className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-line px-4 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={
                      sending ||
                      !draft.trim() ||
                      (composing && !newPhone.trim()) ||
                      Boolean(!composing && selected?.opted_out)
                    }
                    onClick={() => void send()}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-accent-deep px-5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="m-auto max-w-xs text-center">
              <MessageSquarePlus className="mx-auto h-10 w-10 text-accent" />
              <p className="mt-3 font-semibold text-foreground">Pick a conversation</p>
              <p className="mt-1 text-sm text-muted">
                Guest texts to the store number appear on the left. AI Yogi answers automatically until you reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
