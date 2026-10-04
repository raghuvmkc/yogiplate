"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Maximize2,
  MessageCircle,
  Minimize2,
  Phone,
  PhoneOff,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
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
import { ContinuousMic } from "@/lib/mic-recorder";
import { playPhoneRing } from "@/lib/phone-ring";
import { speakableForCall } from "@/lib/speakable";
import type { DietTag } from "@/lib/types";

type ChatRole = "user" | "assistant";

type VerifiedAddressCard =
  | {
      ok: true;
      query: string;
      formatted: string;
      lat: number;
      lng: number;
      maps_url: string;
      provider?: string;
    }
  | { ok: false; query: string; error: string };

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
  verifiedAddress?: VerifiedAddressCard | null;
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
const EXPANDED_STORAGE_KEY = "yogiplate-chat-expanded";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/** Spoken and shown when chat or a call opens. */
const OPENING_MESSAGE =
  "Namaste. I'm AI Yogi with Yogiplate. Our chef and founder, Radhavallabh Prabhu, graduated from IIT Bombay, lived as a monk, and cooks sattvik food that is pure and full of flavor. First I'll collect a few basic details about your event, and then we'll plan the menu together. What occasion are you gathering for?";

function welcomeFor(
  _orderAware?: boolean,
  _diet?: string | null,
  _itemNames?: string[]
) {
  return OPENING_MESSAGE;
}

const CALL_SILENCE_MS = 60_000;
const CALL_OFF_TOPIC_LIMIT = 4;

const CALL_END_SILENCE =
  "I haven't heard you for a minute, so I'll end the call here. Please redial when you're back and ready to discuss your catering.";

const CALL_END_OFF_TOPIC =
  "I'll end the call here. Please redial when you're ready to talk about your Yogiplate catering, and I'll be glad to help.";

export function ChatWidget() {
  const pathname = usePathname();
  const diet = useCartStore((s) => s.diet);
  const guestCount = useCartStore((s) => s.guestCount);
  const eventDate = useCartStore((s) => s.eventDate);
  const notes = useCartStore((s) => s.notes);
  const items = useCartStore((s) => s.items);
  const applyProposal = useCartStore((s) => s.applyProposal);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceSpeak, setVoiceSpeak] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [callConnecting, setCallConnecting] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const continuousMicRef = useRef<ContinuousMic | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const nudgedForCount = useRef(0);
  const listeningRef = useRef(false);
  const busyRef = useRef(false);
  const voiceBusyRef = useRef(false);
  const ttsPlayingRef = useRef(false);
  const callConnectingRef = useRef(false);
  const voiceSpeakRef = useRef(true);
  const speakDoneRef = useRef<(() => void) | null>(null);
  const summarySentRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const endingCallRef = useRef(false);
  const offTopicStreakRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const leadRef = useRef(lead);
  const orderDraftRef = useRef(orderDraft);
  const orderContextRef = useRef<{
    page: string;
    diet: string | null;
    guest_count: number | null;
    event_date: string;
    notes: string;
    item_count: number;
    subtotal: number;
    items: {
      name: string;
      quantity: number;
      unit: string;
      price: number;
      menu_item_id: string;
      variant_id?: string;
    }[];
  } | null>(null);

  const hidden = pathname?.startsWith("/admin");
  const onOrderPage = pathname === "/order" || pathname?.startsWith("/order?");

  const orderContext = useMemo(() => {
    const dietLabel =
      diet && diet in DIET_LABELS
        ? DIET_LABELS[diet as DietTag]
        : diet || null;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    // Only pass order facts the guest actually set. Diet alone (menu browse)
    // is not enough — require cart items so we never leak sticky defaults.
    const hasItems = items.length > 0;
    return {
      page: pathname || "/",
      diet: hasItems ? dietLabel : null,
      guest_count: guestCount > 0 ? guestCount : null,
      event_date: eventDate || "",
      notes: notes || "",
      item_count: items.length,
      subtotal: Math.round(subtotal * 100) / 100,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
        menu_item_id: i.menu_item_id,
        variant_id: i.variant_id,
      })),
    };
  }, [pathname, diet, guestCount, eventDate, notes, items]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    voiceBusyRef.current = voiceBusy;
  }, [voiceBusy]);
  useEffect(() => {
    voiceSpeakRef.current = voiceSpeak;
  }, [voiceSpeak]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    leadRef.current = lead;
  }, [lead]);
  useEffect(() => {
    orderDraftRef.current = orderDraft;
  }, [orderDraft]);
  useEffect(() => {
    orderContextRef.current = orderContext;
  }, [orderContext]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(EXPANDED_STORAGE_KEY) === "1") {
        setExpanded(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/voice/status")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        if (!cancelled) setVoiceEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setVoiceEnabled(false);
      });
    return () => {
      cancelled = true;
      clearSilenceTimer();
      continuousMicRef.current?.stop();
      continuousMicRef.current = null;
      listeningRef.current = false;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      ttsPlayingRef.current = false;
    };
  }, []);

  // When the chat panel closes, stop voice and email a discussion summary once.
  useEffect(() => {
    if (open) return;
    sendChatEndSummary();
    if (listeningRef.current) {
      clearSilenceTimer();
      continuousMicRef.current?.stop();
      continuousMicRef.current = null;
      listeningRef.current = false;
      setListening(false);
      setVoiceBusy(false);
      setCallConnecting(false);
      callConnectingRef.current = false;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    ttsPlayingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close side-effects only
  }, [open]);

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
    // Only carry cart facts when the guest is actively building an order.
    // Never seed invented defaults (25 / vegan / a leftover date).
    const activeOrder = orderAware && orderContext.item_count > 0;
    const nextLead: Lead = {
      ...EMPTY_LEAD,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      diet: activeOrder ? orderContext.diet || "" : "",
      event_date: activeOrder ? orderContext.event_date || "" : "",
      guest_count: activeOrder ? orderContext.guest_count ?? null : null,
      notes: activeOrder ? orderContext.notes || "" : "",
    };
    setLead(nextLead);
    setOrderDraft({
      ...EMPTY_ORDER_DRAFT,
      diet: activeOrder ? orderContext.diet || "" : "",
      event_date: activeOrder ? orderContext.event_date || "" : "",
      adults: activeOrder ? orderContext.guest_count ?? null : null,
      notes: activeOrder ? orderContext.notes || "" : "",
    });
    setAppliedProposalKey(null);
    setIdentified(true);
    summarySentRef.current = false;
    setMessages([
      {
        role: "assistant",
        content: welcomeFor(
          activeOrder,
          activeOrder ? orderContext.diet : null,
          activeOrder ? orderContext.items.map((i) => i.name) : []
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

  function stopSpeaking() {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
      audioPlayerRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    ttsPlayingRef.current = false;
    const done = speakDoneRef.current;
    speakDoneRef.current = null;
    done?.();
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function armSilenceTimer() {
    clearSilenceTimer();
    if (!listeningRef.current || endingCallRef.current) return;
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      if (!listeningRef.current || endingCallRef.current) return;
      if (
        busyRef.current ||
        voiceBusyRef.current ||
        ttsPlayingRef.current ||
        callConnectingRef.current
      ) {
        armSilenceTimer();
        return;
      }
      void endVoiceCall(CALL_END_SILENCE);
    }, CALL_SILENCE_MS);
  }

  async function endVoiceCall(message: string) {
    if (endingCallRef.current || !listeningRef.current) return;
    endingCallRef.current = true;
    clearSilenceTimer();
    offTopicStreakRef.current = 0;
    setMessages((prev) => {
      const next = [...prev, { role: "assistant" as const, content: message }];
      messagesRef.current = next;
      return next;
    });
    const prevSpeak = voiceSpeakRef.current;
    voiceSpeakRef.current = true;
    try {
      await speakReply(message);
    } finally {
      voiceSpeakRef.current = prevSpeak;
      stopListening();
      endingCallRef.current = false;
    }
  }

  function stopListening(updateState = true) {
    callConnectingRef.current = false;
    clearSilenceTimer();
    continuousMicRef.current?.stop();
    continuousMicRef.current = null;
    listeningRef.current = false;
    if (updateState) {
      setCallConnecting(false);
      setListening(false);
      setVoiceBusy(false);
    }
  }

  function sendChatEndSummary() {
    if (summarySentRef.current) return;
    const msgs = messagesRef.current;
    const hasUserTurn = msgs.some((m) => m.role === "user");
    if (!hasUserTurn) return;
    const contact = leadRef.current;
    if (
      contact.name.trim().length < 2 ||
      !isValidPhone(contact.phone) ||
      !isValidEmail(contact.email)
    ) {
      return;
    }
    summarySentRef.current = true;
    const cart = orderContextRef.current;
    const cartHint =
      cart && cart.item_count > 0
        ? `${cart.item_count} item(s)${cart.diet ? ` · ${cart.diet}` : ""}${
            cart.guest_count ? ` · ${cart.guest_count} guests` : ""
          }${cart.event_date ? ` · ${cart.event_date}` : ""}`
        : undefined;
    const payload = {
      session_id: sessionId,
      lead: {
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
      },
      messages: msgs
        .filter((m) => m.content?.trim())
        .slice(-60)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 4000),
        })),
      order_draft: orderDraftRef.current || null,
      cart_hint: cartHint,
    };
    // Fire-and-forget — must not block closing the chat
    void fetch("/api/chat/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* ignore — closing chat should still work */
    });
  }

  function closeChat() {
    sendChatEndSummary();
    stopListening();
    stopSpeaking();
    setOpen(false);
  }

  async function playAudioBlob(blob: Blob) {
    if (!blob.size) return;
    stopSpeaking();
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    ttsPlayingRef.current = true;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        ttsPlayingRef.current = false;
        speakDoneRef.current = null;
        resolve();
      };
      speakDoneRef.current = done;
      audio.onended = done;
      audio.onerror = done;
      void audio.play().catch(done);
    });
  }

  async function fetchTtsBlob(
    text: string,
    opts?: { full?: boolean }
  ): Promise<Blob | null> {
    const spoken =
      listeningRef.current && !opts?.full
        ? speakableForCall(text)
        : text.trim();
    if (!spoken) return null;
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        locale: "en",
        call: listeningRef.current,
      }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size ? blob : null;
  }

  async function speakReply(text: string) {
    if (!voiceEnabled || !voiceSpeakRef.current || !text.trim()) return;
    try {
      const blob = await fetchTtsBlob(text);
      if (!blob) return;
      await playAudioBlob(blob);
    } catch {
      ttsPlayingRef.current = false;
      speakDoneRef.current = null;
    }
  }

  async function handleVoiceUtterance(wav: Blob) {
    if (
      !listeningRef.current ||
      endingCallRef.current ||
      busyRef.current ||
      voiceBusyRef.current
    ) {
      return;
    }
    if (wav.size < 1200) return;
    setVoiceBusy(true);
    voiceBusyRef.current = true;
    setError(null);
    try {
      const form = new FormData();
      form.append("file", wav, "speech.wav");
      const res = await fetch("/api/voice/stt", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.detail || data.error || "Could not hear that — try again."
        );
      }
      const transcript = String(data.text || "").trim();
      if (!transcript) return;
      clearSilenceTimer();
      await send(transcript);
    } catch (e) {
      if (listeningRef.current) {
        setError(
          e instanceof Error ? e.message : "Voice failed. Please try again."
        );
      }
    } finally {
      voiceBusyRef.current = false;
      setVoiceBusy(false);
    }
  }

  async function toggleListening() {
    if (!voiceEnabled || !identified) return;
    if (listening) {
      callConnectingRef.current = false;
      offTopicStreakRef.current = 0;
      stopListening();
      stopSpeaking();
      return;
    }
    offTopicStreakRef.current = 0;
    setError(null);
    stopSpeaking();
    try {
      const mic = new ContinuousMic();
      await mic.start({
        onUtterance: (wav) => {
          void handleVoiceUtterance(wav);
        },
        isMuted: () =>
          callConnectingRef.current ||
          ttsPlayingRef.current ||
          busyRef.current ||
          voiceBusyRef.current ||
          !listeningRef.current,
      });
      continuousMicRef.current = mic;
      listeningRef.current = true;
      callConnectingRef.current = true;
      setListening(true);
      setCallConnecting(true);

      // Short ring while greeting TTS prefetches — then AI Yogi speaks first.
      try {
        const greetingPrefetch = fetchTtsBlob(OPENING_MESSAGE, { full: true });
        await playPhoneRing({ bursts: 1, volume: 0.11 });
        if (!listeningRef.current) return;

        const greeting = welcomeFor();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last?.role === "assistant" &&
            last.content.includes("Radhavallabh Prabhu")
          ) {
            messagesRef.current = prev;
            return prev;
          }
          const next = [
            ...prev,
            { role: "assistant" as const, content: greeting },
          ];
          messagesRef.current = next;
          return next;
        });

        const prevSpeak = voiceSpeakRef.current;
        voiceSpeakRef.current = true;
        setVoiceSpeak(true);
        const ready = await greetingPrefetch;
        if (!listeningRef.current) return;
        if (ready) {
          await playAudioBlob(ready);
        } else {
          const again = await fetchTtsBlob(OPENING_MESSAGE, { full: true });
          if (again) await playAudioBlob(again);
        }
        voiceSpeakRef.current = prevSpeak;
        setVoiceSpeak(prevSpeak);
        if (listeningRef.current) armSilenceTimer();
      } finally {
        callConnectingRef.current = false;
        setCallConnecting(false);
      }
    } catch {
      callConnectingRef.current = false;
      setCallConnecting(false);
      setError("Microphone access is needed to start a call.");
      stopListening();
    }
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busyRef.current || !identified || endingCallRef.current) return;
    if (listeningRef.current) clearSilenceTimer();
    const currentLead = leadRef.current;
    const currentOrder = orderContextRef.current || orderContext;
    const currentDraft = orderDraftRef.current;
    if (
      currentLead.name.trim().length < 2 ||
      !isValidPhone(currentLead.phone) ||
      !isValidEmail(currentLead.email)
    ) {
      setIdentified(false);
      setGateError("Please confirm your name, phone, and email to continue.");
      return;
    }
    setInput("");
    setError(null);
    // Don't cut open-mic session audio path; only stop TTS if speaking.
    stopSpeaking();
    const nextMessages: ChatMessage[] = [
      ...messagesRef.current,
      { role: "user", content: text },
    ];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setBusy(true);
    busyRef.current = true;

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
            ...currentLead,
            phone: currentLead.phone,
            email: currentLead.email,
            diet: currentLead.diet || currentOrder.diet || "",
            event_date: currentLead.event_date || currentOrder.event_date || "",
            guest_count:
              currentLead.guest_count ?? currentOrder.guest_count ?? null,
            notes: currentLead.notes || currentOrder.notes || "",
          },
          order_context: currentOrder,
          order_draft: currentDraft,
          session_id: sessionId,
          voice_mode: listeningRef.current,
        }),
      });
      const rawBody = await res.text();
      type ChatApiPayload = {
        error?: string;
        code?: string;
        detail?: string;
        reply?: string;
        lead?: Partial<Lead>;
        order_draft?: Partial<OrderDraft>;
        cart_proposal?: CartProposal | null;
        lines?: ChatMenuLine[];
        lines_total?: number | null;
        lines_title?: string | null;
        highlights?: ChatHighlight[];
        bullets?: string[];
        offer_whatsapp?: boolean;
        whatsapp_url?: string | null;
        quote_url?: string | null;
        verified_address?: VerifiedAddressCard | null;
        off_topic?: boolean;
      };
      let data: ChatApiPayload = {};
      try {
        data = rawBody ? (JSON.parse(rawBody) as ChatApiPayload) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Chat returned an unexpected response. Please try again."
            : `Chat failed (${res.status}). Please try again.`
        );
      }
      if (!res.ok) {
        const bits = [String(data.error || "Chat failed")];
        if (data.code) bits.push(`[${data.code}]`);
        if (data.detail) bits.push(String(data.detail).slice(0, 160));
        throw new Error(bits.join(" "));
      }
      let reply = String(data.reply || "");
      let hangUpAfterReply = false;
      if (listeningRef.current) {
        if (data.off_topic) offTopicStreakRef.current += 1;
        else offTopicStreakRef.current = 0;
        if (offTopicStreakRef.current >= CALL_OFF_TOPIC_LIMIT) {
          reply = CALL_END_OFF_TOPIC;
          hangUpAfterReply = true;
          offTopicStreakRef.current = 0;
        }
      }
      // Overlap TTS with state updates so speech starts sooner on calls.
      const ttsPrefetch =
        listeningRef.current && reply.trim()
          ? fetchTtsBlob(reply)
          : null;
      if (data.lead && typeof data.lead === "object") {
        const nextLead = data.lead;
        setLead((prev) => {
          const nextGuests =
            nextLead.guest_count != null && Number(nextLead.guest_count) > 0
              ? Number(nextLead.guest_count)
              : null;
          const merged = {
            ...EMPTY_LEAD,
            ...prev,
            ...nextLead,
            name: nextLead.name || prev.name || "",
            phone: nextLead.phone || prev.phone || "",
            email: nextLead.email || prev.email || "",
            event_date: nextLead.event_date || prev.event_date || "",
            diet: nextLead.diet || prev.diet || "",
            city: nextLead.city || prev.city || "",
            notes: nextLead.notes || prev.notes || "",
            guest_count:
              nextGuests ??
              (prev.guest_count != null && prev.guest_count > 0
                ? prev.guest_count
                : null),
          };
          leadRef.current = merged;
          return merged;
        });
      }
      if (data.order_draft && typeof data.order_draft === "object") {
        const mergedDraft = {
          ...EMPTY_ORDER_DRAFT,
          ...data.order_draft,
        } as OrderDraft;
        orderDraftRef.current = mergedDraft;
        setOrderDraft(mergedDraft);
      }
      const proposal =
        data.cart_proposal &&
        typeof data.cart_proposal === "object" &&
        Array.isArray(data.cart_proposal.items) &&
        data.cart_proposal.items.length > 0
          ? data.cart_proposal
          : null;
      const menuLines = Array.isArray(data.lines)
        ? data.lines
            .filter((l) => l && String(l.name || "").trim())
            .slice(0, 12)
        : undefined;
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            role: "assistant" as const,
            content: reply,
            highlights: Array.isArray(data.highlights)
              ? data.highlights
              : undefined,
            bullets: Array.isArray(data.bullets) ? data.bullets : undefined,
            lines: menuLines?.length ? menuLines : undefined,
            linesTotal:
              data.lines_total != null &&
              Number.isFinite(Number(data.lines_total))
                ? Number(data.lines_total)
                : null,
            linesTitle:
              typeof data.lines_title === "string" ? data.lines_title : null,
            offerWhatsApp: Boolean(data.offer_whatsapp),
            whatsappUrl:
              typeof data.whatsapp_url === "string" ? data.whatsapp_url : null,
            cartProposal: proposal,
            quoteUrl:
              typeof data.quote_url === "string" ? data.quote_url : null,
            verifiedAddress: data.verified_address || null,
          },
        ];
        messagesRef.current = next;
        return next;
      });
      if (ttsPrefetch) {
        try {
          const blob = await ttsPrefetch;
          if (blob && voiceSpeakRef.current) {
            await playAudioBlob(blob);
          } else if (!blob) {
            await speakReply(reply);
          }
        } catch {
          await speakReply(reply);
        }
      } else {
        await speakReply(reply);
      }
      if (hangUpAfterReply) {
        stopListening();
      } else if (listeningRef.current) {
        armSilenceTimer();
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly =
        /failed to fetch|networkerror|load failed|aborted/i.test(raw)
          ? "Chat timed out or lost connection — please try that question again."
          : raw || "Something went wrong. Please try again.";
      setError(friendly);
      if (listeningRef.current && !endingCallRef.current) armSilenceTimer();
    } finally {
      busyRef.current = false;
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
        <div
          className={`flex flex-col overflow-hidden border-2 border-line bg-white shadow-[0_18px_50px_rgba(42,74,54,0.18)] transition-[width,height] duration-200 ${
            expanded
              ? "h-[min(90svh,calc(100svh-3rem))] w-[min(42rem,calc(100vw-1.5rem))]"
              : "h-[min(34rem,calc(100svh-6rem))] w-[min(24rem,calc(100vw-1.5rem))]"
          }`}
        >
          <div className="flex items-start justify-between gap-3 bg-accent-deep px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold tracking-wide">
                AI Yogi
              </p>
              <p className="mt-0.5 text-xs font-medium text-white/80">
                {!identified
                  ? "Name, phone & email required to start"
                  : listening
                    ? voiceBusy
                      ? "On a call · hearing you…"
                      : busy
                        ? "On a call · AI Yogi is speaking soon"
                        : "On a call with AI Yogi"
                    : voiceEnabled
                      ? orderContext.item_count > 0
                        ? `Call ready · cart (${orderContext.item_count})`
                        : "Call or chat · menus & catering"
                      : orderContext.item_count > 0
                        ? `Aware of your cart · ${orderContext.item_count} item${orderContext.item_count === 1 ? "" : "s"}`
                        : "Front desk · menus & catering only"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {voiceEnabled && identified && listening ? (
                <button
                  type="button"
                  aria-label={
                    voiceSpeak ? "Mute call audio" : "Unmute call audio"
                  }
                  title={voiceSpeak ? "Mute AI Yogi" : "Unmute AI Yogi"}
                  className="rounded p-1 text-white/90 transition hover:bg-white/10"
                  onClick={() => {
                    setVoiceSpeak((v) => {
                      if (v) stopSpeaking();
                      return !v;
                    });
                  }}
                >
                  {voiceSpeak ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                aria-label={expanded ? "Shrink chat" : "Expand chat"}
                className="rounded p-1 text-white/90 transition hover:bg-white/10"
                onClick={() => {
                  setExpanded((prev) => {
                    const next = !prev;
                    try {
                      sessionStorage.setItem(
                        EXPANDED_STORAGE_KEY,
                        next ? "1" : "0"
                      );
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                }}
              >
                {expanded ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                aria-label="Close chat"
                className="rounded p-1 text-white/90 transition hover:bg-white/10"
                onClick={() => closeChat()}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                {listening ? (
                  <div className="flex items-center justify-between gap-2 border border-accent/30 bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-deep" />
                      </span>
                      <p className="truncate text-xs font-semibold text-accent-deep">
                        {callConnecting
                          ? "Ringing… AI Yogi will greet you first"
                          : voiceBusy
                            ? "Call connected · listening…"
                            : busy
                              ? "Call connected · AI Yogi responding…"
                              : "Call connected — your turn to speak"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        stopListening();
                        stopSpeaking();
                      }}
                      className="inline-flex shrink-0 items-center gap-1 bg-red-700 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-red-600"
                    >
                      <PhoneOff className="h-3 w-3" />
                      End
                    </button>
                  </div>
                ) : null}
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
                            {m.cartProposal.items.map((line) => (
                              <li key={`${line.menu_item_id}-${line.variant_id || ""}`}>
                                {line.quantity}× {line.name}
                              </li>
                            ))}
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
                      {m.verifiedAddress ? (
                        <div className="mt-2 space-y-1.5 border-t border-line pt-2">
                          {m.verifiedAddress.ok ? (
                            <>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">
                                Verified address
                              </p>
                              <p className="text-xs leading-snug text-foreground">
                                {m.verifiedAddress.formatted}
                              </p>
                              <a
                                href={m.verifiedAddress.maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex bg-accent-deep px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent"
                              >
                                Open in Maps
                              </a>
                            </>
                          ) : (
                            <>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">
                                Address check
                              </p>
                              <p className="text-xs leading-snug text-foreground">
                                {m.verifiedAddress.error}
                              </p>
                              {m.verifiedAddress.query ? (
                                <p className="text-[11px] text-muted">
                                  You said: {m.verifiedAddress.query}
                                </p>
                              ) : null}
                            </>
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
                      {/* WhatsApp chat transfer — re-enable later with agent WHATSAPP_CHAT_TRANSFER_ENABLED
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
                      */}
                    </div>
                  </div>
                ))}
                {busy || voiceBusy ? (
                  <p className="text-xs font-medium text-muted">
                    {voiceBusy
                      ? "Hearing you on the call…"
                      : listening
                        ? "AI Yogi is responding on the call…"
                        : "Front desk is typing…"}
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
                  {voiceEnabled ? (
                    <button
                      type="button"
                      onClick={() => void toggleListening()}
                      aria-label={listening ? "End call" : "Call AI Yogi"}
                      title={
                        listening
                          ? "End call"
                          : "Call AI Yogi — stay on the line and talk naturally"
                      }
                      className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-white transition ${
                        listening
                          ? "bg-red-700 hover:bg-red-600"
                          : "bg-accent-deep hover:bg-accent"
                      }`}
                    >
                      {listening ? (
                        <>
                          <PhoneOff className="h-4 w-4" />
                          End
                        </>
                      ) : (
                        <>
                          <Phone className="h-4 w-4" />
                          Call
                        </>
                      )}
                    </button>
                  ) : null}
                  <textarea
                    ref={inputRef}
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={
                      listening
                        ? "On a call… you can still type"
                        : voiceEnabled
                          ? "Type a message or tap Call…"
                          : "Ask about menus, diets, trays…"
                    }
                    className="min-h-[2.75rem] flex-1 resize-none border border-line bg-warm px-3 py-2 text-sm outline-none focus:border-accent"
                    disabled={busy || voiceBusy}
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || voiceBusy || !input.trim()}
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
          if (open) closeChat();
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
