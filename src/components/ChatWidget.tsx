"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X } from "lucide-react";
import {
  ChatRichMessage,
  type ChatHighlight,
  type ChatMenuLine,
} from "@/components/ChatRichMessage";
import { DIET_LABELS } from "@/lib/data/diet-profiles";
import {
  EMPTY_ORDER_DRAFT,
  type CartProposal,
  type OrderDraft,
} from "@/lib/chat/order-draft";
import { useCartStore } from "@/lib/cart-store";
import type { DietTag } from "@/lib/types";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  highlights?: ChatHighlight[];
  bullets?: string[];
  lines?: ChatMenuLine[];
  linesTotal?: number | null;
  linesTitle?: string | null;
  offerWhatsApp?: boolean;
  whatsappUrl?: string | null;
  cartProposal?: CartProposal | null;
  quoteUrl?: string | null;
};

type Lead = {
  name: string;
  phone: string;
  email: string;
  event_date: string;
  guest_count: number | null;
  diet: string;
  city: string;
  notes: string;
};

const EMPTY_LEAD: Lead = {
  name: "",
  phone: "",
  email: "",
  event_date: "",
  guest_count: null,
  diet: "",
  city: "",
  notes: "",
};

const NUDGE_STORAGE_KEY = "yogiplate-chat-order-nudge-dismissed";
const CONTACT_STORAGE_KEY = "yogiplate-chat-contact";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function welcomeFor(orderAware: boolean, diet: string | null, itemNames: string[]) {
  if (orderAware) {
    const dietPart = diet ? ` your ${diet} order` : " your order";
    const itemHint =
      itemNames.length > 0
        ? ` I can already see what you are building (${itemNames
            .slice(0, 4)
            .join(", ")}${itemNames.length > 4 ? ",…" : ""}).`
        : "";
    return `Namaste — thanks for sharing your contact. Happy to help with${dietPart}.${itemHint} Any questions about trays, servings, or what else to add?`;
  }
  return "Namaste — thanks for sharing your contact. I can help with our menus, Jain / Swaminarayan / Pushtimarg / Pure Vegetarian / Vegan / Italian paths, tray sizes, and catering for your event. What can I help you with?";
}

export function ChatWidget() {
  const pathname = usePathname();
  const diet = useCartStore((s) => s.diet);
  const guestCount = useCartStore((s) => s.guestCount);
  const eventDate = useCartStore((s) => s.eventDate);
  const notes = useCartStore((s) => s.notes);
  const items = useCartStore((s) => s.items);
  const applyProposal = useCartStore((s) => s.applyProposal);

  const [open, setOpen] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [gateName, setGateName] = useState("");
  const [gatePhone, setGatePhone] = useState("");
  const [gateEmail, setGateEmail] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead>(EMPTY_LEAD);
  const [orderDraft, setOrderDraft] = useState<OrderDraft>(EMPTY_ORDER_DRAFT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showOrderNudge, setShowOrderNudge] = useState(false);
  const [pendingOrderWelcome, setPendingOrderWelcome] = useState(false);
  const [appliedProposalKey, setAppliedProposalKey] = useState<string | null>(
    null
  );
  const [sessionId] = useState(
    () =>
      `web_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nudgedForCount = useRef(0);

  const hidden = pathname?.startsWith("/admin");
  const onOrderPage = pathname === "/order" || pathname?.startsWith("/order?");

  const orderContext = useMemo(() => {
    const dietLabel =
      diet && diet in DIET_LABELS
        ? DIET_LABELS[diet as DietTag]
        : diet || null;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      page: pathname || "/",
      diet: dietLabel,
      guest_count: guestCount,
      event_date: eventDate || "",
      notes: notes || "",
      item_count: items.length,
      subtotal: Math.round(subtotal * 100) / 100,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
      })),
    };
  }, [pathname, diet, guestCount, eventDate, notes, items]);

  // Restore contact from this browser session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONTACT_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        name?: string;
        phone?: string;
        email?: string;
      };
      if (
        saved.name &&
        saved.phone &&
        saved.email &&
        saved.name.trim().length >= 2 &&
        isValidPhone(saved.phone) &&
        isValidEmail(saved.email)
      ) {
        setGateName(saved.name);
        setGatePhone(saved.phone);
        setGateEmail(saved.email);
        setLead((prev) => ({
          ...prev,
          name: saved.name!.trim(),
          phone: saved.phone!.trim(),
          email: saved.email!.trim(),
        }));
        setIdentified(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (hidden || open || !onOrderPage) {
      setShowOrderNudge(false);
      return;
    }
    if (typeof window !== "undefined") {
      const dismissed = sessionStorage.getItem(NUDGE_STORAGE_KEY);
      if (dismissed === "1") {
        setShowOrderNudge(false);
        return;
      }
    }
    if (items.length >= 1 && nudgedForCount.current === 0) {
      nudgedForCount.current = items.length;
      const t = window.setTimeout(() => setShowOrderNudge(true), 1800);
      return () => window.clearTimeout(t);
    }
    setShowOrderNudge(false);
  }, [hidden, open, onOrderPage, items.length]);

  useEffect(() => {
    if (!open) return;
    if (!identified) {
      nameRef.current?.focus();
      return;
    }
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
    inputRef.current?.focus();
  }, [open, identified, messages, busy]);

  function dismissNudge() {
    setShowOrderNudge(false);
    try {
      sessionStorage.setItem(NUDGE_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function startChatSession(
    contact: { name: string; phone: string; email: string },
    orderAware: boolean
  ) {
    const nextLead: Lead = {
      ...EMPTY_LEAD,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      diet: orderContext.diet || "",
      event_date: orderContext.event_date || "",
      guest_count: orderContext.guest_count ?? null,
      notes: orderContext.notes || "",
    };
    setLead(nextLead);
    setOrderDraft({
      ...EMPTY_ORDER_DRAFT,
      diet: orderContext.diet || "",
      event_date: orderContext.event_date || "",
      adults: orderContext.guest_count ?? null,
      notes: orderContext.notes || "",
    });
    setAppliedProposalKey(null);
    setIdentified(true);
    setMessages([
      {
        role: "assistant",
        content: welcomeFor(
          orderAware,
          orderContext.diet,
          orderContext.items.map((i) => i.name)
        ),
      },
    ]);
    try {
      sessionStorage.setItem(
        CONTACT_STORAGE_KEY,
        JSON.stringify({
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function submitGate(e?: React.FormEvent) {
    e?.preventDefault();
    const name = gateName.trim();
    const phone = gatePhone.trim();
    const email = gateEmail.trim();
    if (name.length < 2) {
      setGateError("Please enter your name.");
      return;
    }
    if (!isValidPhone(phone)) {
      setGateError("Please enter a valid phone number (at least 10 digits).");
      return;
    }
    if (!isValidEmail(email)) {
      setGateError("Please enter a valid email address.");
      return;
    }
    setGateError(null);
    startChatSession(
      { name, phone, email },
      pendingOrderWelcome || (onOrderPage && orderContext.item_count > 0)
    );
    setPendingOrderWelcome(false);
  }

  function openChat(opts?: { orderAware?: boolean }) {
    dismissNudge();
    setPendingOrderWelcome(Boolean(opts?.orderAware));
    setOpen(true);
    if (identified && lead.name && lead.phone && lead.email) {
      if (messages.length === 0) {
        startChatSession(
          { name: lead.name, phone: lead.phone, email: lead.email },
          Boolean(opts?.orderAware)
        );
      } else if (opts?.orderAware && messages.length <= 1) {
        setMessages([
          {
            role: "assistant",
            content: welcomeFor(
              true,
              orderContext.diet,
              orderContext.items.map((i) => i.name)
            ),
          },
        ]);
      }
    }
  }

  if (hidden) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy || !identified) return;
    if (
      lead.name.trim().length < 2 ||
      !isValidPhone(lead.phone) ||
      !isValidEmail(lead.email)
    ) {
      setIdentified(false);
      setGateError("Please confirm your name, phone, and email to continue.");
      return;
    }
    setInput("");
    setError(null);
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          lead: {
            ...lead,
            phone: lead.phone,
            email: lead.email,
            diet: lead.diet || orderContext.diet || "",
            event_date: lead.event_date || orderContext.event_date || "",
            guest_count: lead.guest_count ?? orderContext.guest_count ?? null,
            notes: lead.notes || orderContext.notes || "",
          },
          order_context: orderContext,
          order_draft: orderDraft,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const bits = [data.error || "Chat failed"];
        if (data.code) bits.push(`[${data.code}]`);
        if (data.detail) bits.push(String(data.detail).slice(0, 160));
        throw new Error(bits.join(" "));
      }
      if (data.lead) {
        setLead((prev) => ({
          ...EMPTY_LEAD,
          ...data.lead,
          // Never let the model wipe the gated contact fields.
          name: prev.name || data.lead.name || "",
          phone: prev.phone || data.lead.phone || "",
          email: prev.email || data.lead.email || "",
        }));
      }
      if (data.order_draft && typeof data.order_draft === "object") {
        setOrderDraft({
          ...EMPTY_ORDER_DRAFT,
          ...data.order_draft,
        } as OrderDraft);
      }
      const proposal =
        data.cart_proposal &&
        typeof data.cart_proposal === "object" &&
        Array.isArray(data.cart_proposal.items) &&
        data.cart_proposal.items.length > 0
          ? (data.cart_proposal as CartProposal)
          : null;
      const menuLines = Array.isArray(data.lines)
        ? (data.lines as ChatMenuLine[])
            .filter((l) => l && String(l.name || "").trim())
            .slice(0, 10)
        : undefined;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply as string,
          highlights: Array.isArray(data.highlights)
            ? (data.highlights as ChatHighlight[])
            : undefined,
          bullets: Array.isArray(data.bullets)
            ? (data.bullets as string[])
            : undefined,
          lines: menuLines?.length ? menuLines : undefined,
          linesTotal:
            data.lines_total != null && Number.isFinite(Number(data.lines_total))
              ? Number(data.lines_total)
              : null,
          linesTitle:
            typeof data.lines_title === "string" ? data.lines_title : null,
          offerWhatsApp: Boolean(data.offer_whatsapp),
          whatsappUrl: data.whatsapp_url || null,
          cartProposal: proposal,
          quoteUrl:
            typeof data.quote_url === "string" ? data.quote_url : null,
        },
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function proposalKey(p: CartProposal) {
    return `${p.items.map((i) => `${i.menu_item_id}:${i.quantity}`).join("|")}|${p.summary}`;
  }

  function applyCartProposal(proposal: CartProposal) {
    const n = applyProposal(proposal);
    if (n > 0) setAppliedProposalKey(proposalKey(proposal));
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {showOrderNudge && !open ? (
        <div className="max-w-[min(18.5rem,calc(100vw-5.5rem))] border border-line bg-white px-3 py-2.5 shadow-[0_10px_28px_rgba(42,74,54,0.14)]">
          <p className="text-sm font-medium leading-snug text-foreground">
            Building your order? Ask if you have any questions — I can see what
            you are adding.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => openChat({ orderAware: true })}
              className="bg-accent-deep px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent"
            >
              Ask a question
            </button>
            <button
              type="button"
              onClick={dismissNudge}
              className="px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-accent-deep"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="flex h-[min(34rem,calc(100svh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden border-2 border-line bg-white shadow-[0_18px_50px_rgba(42,74,54,0.18)]">
          <div className="flex items-start justify-between gap-3 bg-accent-deep px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold tracking-wide">
                AI Yogi
              </p>
              <p className="mt-0.5 text-xs font-medium text-white/80">
                {!identified
                  ? "Name, phone & email required to start"
                  : orderContext.item_count > 0
                    ? `Aware of your cart · ${orderContext.item_count} item${orderContext.item_count === 1 ? "" : "s"}`
                    : "Front desk · menus & catering only"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              className="rounded p-1 text-white/90 transition hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!identified ? (
            <form
              onSubmit={submitGate}
              className="flex flex-1 flex-col justify-center gap-3 bg-warm px-4 py-5"
            >
              <p className="text-sm font-medium leading-relaxed text-foreground">
                Before we begin, please share your name, phone, and email so our
                team can follow up if needed.
              </p>
              <label className="block text-xs font-semibold tracking-wide text-muted">
                Name
                <input
                  ref={nameRef}
                  type="text"
                  autoComplete="name"
                  value={gateName}
                  onChange={(e) => setGateName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </label>
              <label className="block text-xs font-semibold tracking-wide text-muted">
                Phone
                <input
                  ref={phoneRef}
                  type="tel"
                  autoComplete="tel"
                  value={gatePhone}
                  onChange={(e) => setGatePhone(e.target.value)}
                  placeholder="(510) 555-0199"
                  className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </label>
              <label className="block text-xs font-semibold tracking-wide text-muted">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={gateEmail}
                  onChange={(e) => setGateEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </label>
              {gateError ? (
                <p className="text-xs font-medium text-accent-deep">{gateError}</p>
              ) : null}
              <button
                type="submit"
                className="mt-1 bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent"
              >
                Start chat
              </button>
            </form>
          ) : (
            <>
              <div
                ref={scrollerRef}
                className="flex-1 space-y-3 overflow-y-auto bg-warm px-3 py-3"
              >
                <p className="text-[11px] font-medium text-muted">
                  Chatting as {lead.name} · {lead.email} · {lead.phone}
                </p>
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] px-3 py-2 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-accent-deep text-white"
                          : "border border-line bg-white text-foreground"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <ChatRichMessage
                          content={m.content}
                          highlights={m.highlights}
                          bullets={m.bullets}
                          lines={m.lines}
                          linesTotal={m.linesTotal}
                          linesTitle={m.linesTitle}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                      {m.cartProposal ? (
                        <div className="mt-2 space-y-2 border-t border-line pt-2">
                          <p className="text-xs font-medium text-muted">
                            {m.cartProposal.summary}
                          </p>
                          <ul className="space-y-0.5 text-xs text-foreground">
                            {m.cartProposal.items.slice(0, 6).map((line) => (
                              <li key={`${line.menu_item_id}-${line.variant_id || ""}`}>
                                {line.quantity}× {line.name}
                              </li>
                            ))}
                            {m.cartProposal.items.length > 6 ? (
                              <li>
                                +{m.cartProposal.items.length - 6} more…
                              </li>
                            ) : null}
                          </ul>
                          {appliedProposalKey === proposalKey(m.cartProposal) ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold text-accent-deep">
                                Added to Build order
                              </p>
                              <Link
                                href="/order"
                                className="inline-flex bg-accent-deep px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent"
                              >
                                Open Build order
                              </Link>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                applyCartProposal(m.cartProposal!)
                              }
                              className="inline-flex bg-accent-deep px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent"
                            >
                              Add to Build order
                            </button>
                          )}
                        </div>
                      ) : null}
                      {m.quoteUrl ? (
                        <a
                          href={m.quoteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex bg-accent-deep px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent"
                        >
                          View quote & pay deposit
                        </a>
                      ) : null}
                      {m.offerWhatsApp && m.whatsappUrl ? (
                        <a
                          href={m.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center justify-center bg-[#25D366] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95"
                        >
                          Continue on WhatsApp with owner
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
                {busy ? (
                  <p className="text-xs font-medium text-muted">
                    Front desk is typing…
                  </p>
                ) : null}
                {error ? (
                  <p className="border border-line bg-white px-3 py-2 text-xs font-medium text-accent-deep">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-line bg-white p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Ask about menus, diets, trays…"
                    className="min-h-[2.75rem] flex-1 resize-none border border-line bg-warm px-3 py-2 text-sm outline-none focus:border-accent"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || !input.trim()}
                    aria-label="Send message"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-accent-deep text-white transition hover:bg-accent disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (open) setOpen(false);
          else openChat();
        }}
        aria-label={open ? "Close chat" : "Talk to AI Yogi"}
        className="inline-flex items-center gap-2 bg-accent-deep px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(42,74,54,0.28)] transition hover:bg-accent"
      >
        {open ? (
          <>
            <X className="h-4 w-4" />
            Close
          </>
        ) : (
          <>
            <MessageCircle className="h-4 w-4" />
            Talk to AI Yogi
          </>
        )}
      </button>
    </div>
  );
}
