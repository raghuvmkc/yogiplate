"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminCalendarPageClient } from "@/components/AdminCalendarPageClient";
import { DeskTexts } from "@/components/DeskTexts";
import type { CartLine, DietTag, MenuCategory } from "@/lib/types";

export type DeskMenuItem = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  unit: string;
  variants?: { id: string; label: string; price: number; unit?: string }[];
};

type DeskCall = {
  accept: () => void;
  reject: () => void;
  disconnect: () => void;
  mute: (muted?: boolean) => void;
  sendDigits: (digits: string) => void;
  on: (event: string, handler: () => void) => void;
  parameters: { From?: string; To?: string };
  customParameters?: Map<string, string>;
};

/** Website-chat transfers arrive as client:guest_* with the guest's name and phone attached. */
function callerLabel(call: DeskCall | null) {
  if (!call) return "";
  const from = call.parameters?.From || "";
  if (from.startsWith("client:guest_")) {
    const guest = call.customParameters?.get("GuestName") || "Website guest";
    const guestPhone = call.customParameters?.get("GuestPhone");
    return `${guest}${guestPhone ? ` · ${guestPhone}` : ""} (website chat)`;
  }
  return from || call.parameters?.To || "";
}

function callerPhone(call: DeskCall) {
  const from = call.parameters?.From || "";
  if (from.startsWith("client:")) return call.customParameters?.get("GuestPhone") || "";
  return from;
}

type CallRow = {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  duration: string;
  started_at: string;
};

const DIETS: { id: DietTag; label: string }[] = [
  { id: "pure_vegetarian", label: "Pure vegetarian" },
  { id: "jain", label: "Jain" },
  { id: "swaminarayan", label: "Swaminarayan" },
  { id: "pushtimarg", label: "Pushtimarg" },
  { id: "vegan", label: "Vegan" },
  { id: "italian", label: "Italian" },
];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function callbackNumber(call: CallRow) {
  return call.direction.startsWith("outbound") ? call.to : call.from;
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ManagerDesk({
  items,
  categories,
  setupFee,
}: {
  items: DeskMenuItem[];
  categories: MenuCategory[];
  setupFee: number;
}) {
  const deviceRef = useRef<{
    destroy: () => void;
    updateToken: (token: string) => void;
    connect: (options: { params: Record<string, string> }) => Promise<DeskCall>;
  } | null>(null);
  const [status, setStatus] = useState("Connecting the phone…");
  const [phoneReady, setPhoneReady] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [incoming, setIncoming] = useState<DeskCall | null>(null);
  const [active, setActive] = useState<DeskCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [tones, setTones] = useState("");
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [tab, setTab] = useState<"texts" | "calendar" | "menu" | "quote" | "invoice">("quote");
  const [unreadTexts, setUnreadTexts] = useState(0);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [guests, setGuests] = useState("");
  const [diet, setDiet] = useState<DietTag>("pure_vegetarian");
  const [service, setService] = useState<"delivery" | "pickup">("delivery");
  const [setupService, setSetupService] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"quote" | "invoice" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string) => map.get(id) || "";
  }, [categories]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 24);
    return items
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 24);
  }, [items, query]);

  async function loadCalls() {
    const res = await fetch("/api/admin/voice/calls");
    if (!res.ok) return;
    const data = await res.json();
    setCalls(data.calls || []);
  }

  useEffect(() => {
    void loadCalls();
    const timer = window.setInterval(() => void loadCalls(), 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch("/api/admin/voice/token");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!cancelled && !deviceRef.current) {
          setPhoneReady(false);
          setStatus("Phone is not ready");
          setPhoneError(
            data.configured === false
              ? "Add the Twilio voice keys in the environment, then restart the server."
              : data.error || "Could not start the phone."
          );
        }
        return;
      }
      if (cancelled) return;
      if (deviceRef.current) {
        deviceRef.current.updateToken(data.token);
        return;
      }
      const { Device } = await import("@twilio/voice-sdk");
      if (cancelled) return;
      const device = new Device(data.token, { closeProtection: true });
      device.on("registered", () => {
        setPhoneReady(true);
        setPhoneError(null);
        setStatus("Ready for calls");
      });
      device.on("unregistered", () => {
        setPhoneReady(false);
        setStatus("Phone disconnected");
      });
      device.on("error", (error: { message?: string }) => {
        setPhoneError(error.message || "The phone hit an error.");
      });
      device.on("incoming", (call: DeskCall) => {
        const label = callerLabel(call);
        const from = callerPhone(call);
        setIncoming(call);
        setStatus(label ? `Incoming ${label}` : "Incoming call");
        if (from) setPhone((current) => current || from);
        call.on("cancel", () => {
          setIncoming((current) => (current === call ? null : current));
          setStatus("Ready for calls");
        });
        call.on("disconnect", () => {
          setActive((current) => (current === call ? null : current));
          setIncoming((current) => (current === call ? null : current));
          setMuted(false);
          setTones("");
          setStatus("Ready for calls");
          void loadCalls();
        });
      });
      deviceRef.current = device;
      await device.register();
    }

    void connect();
    const refreshTimer = window.setInterval(() => void connect(), 50 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.body.dataset.adminBusy = active || incoming ? "1" : "";
    return () => {
      document.body.dataset.adminBusy = "";
    };
  }, [active, incoming]);

  function watchCall(call: DeskCall, label: string) {
    setActive(call);
    setStatus(label);
    call.on("accept", () => setStatus("On a call"));
    call.on("disconnect", () => {
      setActive((current) => (current === call ? null : current));
      setMuted(false);
      setTones("");
      setStatus("Ready for calls");
      void loadCalls();
    });
  }

  async function placeCall(to: string) {
    const device = deviceRef.current;
    if (!device || !phoneReady) return;
    setPhoneError(null);
    const res = await fetch("/api/admin/voice/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPhoneError(data.error || "Could not start the call.");
      return;
    }
    setPhone((current) => current || data.to);
    try {
      const call = await device.connect({ params: { Ticket: data.ticket } });
      watchCall(call, `Calling ${data.to}`);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not start the call.");
    }
  }

  function answer() {
    if (!incoming) return;
    incoming.accept();
    const label = callerLabel(incoming);
    setIncoming(null);
    watchCall(incoming, label ? `On a call with ${label}` : "On a call");
  }

  function decline() {
    incoming?.reject();
    setIncoming(null);
    setStatus("Ready for calls");
  }

  function sendTone(key: string) {
    if (!active) return;
    active.sendDigits(key);
    setTones((current) => (current + key).slice(-32));
  }

  function hangUp() {
    active?.disconnect();
    incoming?.reject();
  }

  function addItem(item: DeskMenuItem) {
    const variant = item.variants?.[0];
    const lineId = variant ? `${item.id}:${variant.id}` : item.id;
    const line: CartLine = {
      menu_item_id: item.id,
      line_id: lineId,
      variant_id: variant?.id,
      name: variant ? `${item.name} (${variant.label})` : item.name,
      price: variant?.price ?? item.price,
      quantity: 1,
      unit: variant?.unit || item.unit || "tray",
    };
    setLines((current) => {
      const found = current.find((row) => row.line_id === lineId);
      if (!found) return [...current, line];
      return current.map((row) =>
        row.line_id === lineId ? { ...row, quantity: row.quantity + 1 } : row
      );
    });
  }

  function payload() {
    return {
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      diet_profile: diet,
      event_date: eventDate,
      event_time: eventTime,
      guest_count: Number(guests) || 0,
      delivery_or_pickup: service,
      address,
      city,
      state: "CA",
      zip,
      notes,
      setup_service: service === "delivery" && setupService,
      items: lines,
    };
  }

  async function send(kind: "quote" | "invoice", event: FormEvent) {
    event.preventDefault();
    setBusy(kind);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/desk/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Could not send that.");
        return;
      }
      if (kind === "quote") {
        setNotice(
          data.email_sent
            ? `Quotation ${data.quote_number} was emailed.`
            : `Quotation ${data.quote_number} was saved. Email was not sent (${data.email_reason || "mail"}).`
        );
      } else {
        setNotice(
          data.email_sent
            ? `Invoice ${data.invoice_number} was emailed with a pay link. The order stays unpaid until they pay.`
            : `Invoice ${data.invoice_number} was saved. Email was not sent (${data.email_reason || "mail"}).`
        );
      }
    } finally {
      setBusy(null);
    }
  }

  const remote = callerLabel(incoming) || callerLabel(active);

  return (
    <div className="mx-auto grid max-w-[1400px] lg:grid-cols-[22rem_1fr]">
      <aside className="border-b border-line bg-warm px-4 py-5 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <p className="eyebrow">Manager phone</p>
        <p className="font-display mt-2 text-3xl text-foreground">
          {incoming ? "Incoming call" : active ? "On a call" : "Desk"}
        </p>
        <p className="mt-1 text-sm text-muted">{status}</p>
        {remote ? <p className="mt-2 text-lg font-semibold text-accent-deep">{remote}</p> : null}
        {phoneError ? <p className="mt-3 text-sm text-accent-deep">{phoneError}</p> : null}

        {incoming ? (
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={answer} className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white">
              Answer
            </button>
            <button type="button" onClick={decline} className="border border-line px-4 py-2 text-sm font-semibold">
              Decline
            </button>
          </div>
        ) : null}

        {active ? (
          <label className="mt-5 block text-sm font-semibold text-foreground">
            Keypad tones
            <span className="ml-1 font-normal text-muted">— for “press 1…”, extensions, or PINs</span>
            <input
              value={tones}
              readOnly
              onKeyDown={(event) => {
                if (/^[0-9*#]$/.test(event.key)) {
                  event.preventDefault();
                  sendTone(event.key);
                }
              }}
              placeholder="Tap keys or type digits"
              className="mt-1 w-full border border-accent bg-white px-3 py-2 text-base tracking-[0.2em]"
            />
          </label>
        ) : (
          <label className="mt-5 block text-sm font-semibold text-foreground">
            Number
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="408 555 0100"
              className="mt-1 w-full border border-line bg-white px-3 py-2 text-base"
            />
          </label>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => (active ? sendTone(key) : setNumber((current) => current + key))}
              className={`border bg-white py-3 text-lg font-semibold text-foreground active:bg-warm ${
                active ? "border-accent" : "border-line"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!phoneReady || Boolean(active)}
            onClick={() => void placeCall(number)}
            className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Call
          </button>
          {active ? null : (
            <button
              type="button"
              onClick={() => setNumber((current) => current.slice(0, -1))}
              className="border border-line bg-white px-4 py-2 text-sm font-semibold"
            >
              Delete
            </button>
          )}
          {active ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  active.mute(next);
                  setMuted(next);
                }}
                className="border border-line bg-white px-4 py-2 text-sm font-semibold"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" onClick={hangUp} className="bg-[#8d3b32] px-4 py-2 text-sm font-semibold text-white">
                Hang up
              </button>
            </>
          ) : null}
        </div>

        <p className="mt-6 text-sm font-semibold text-foreground">Previous calls</p>
        <ul className="mt-2 divide-y divide-line">
          {calls.length === 0 ? <li className="py-3 text-sm text-muted">No calls yet.</li> : null}
          {calls.map((call) => {
            const who = callbackNumber(call);
            const outbound = call.direction.startsWith("outbound");
            return (
              <li key={call.sid}>
                <button
                  type="button"
                  onClick={() => {
                    setNumber(who);
                    setPhone(who);
                  }}
                  className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{who}</span>
                    <span className="text-xs text-muted">
                      {outbound ? "Outgoing" : "Incoming"} · {call.status} · {when(call.started_at)}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{call.duration}s</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="px-4 py-5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["texts", "Texts"],
              ["calendar", "Calendar"],
              ["menu", "Menu"],
              ["quote", "Quote"],
              ["invoice", "Invoice"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? "inline-flex items-center gap-2 bg-accent-deep px-4 py-2 text-sm font-semibold text-white"
                  : "inline-flex items-center gap-2 border border-line px-4 py-2 text-sm font-semibold text-foreground"
              }
            >
              {label}
              {id === "texts" && unreadTexts > 0 ? (
                <span className="min-w-5 rounded-full bg-[#c2410c] px-1.5 text-center text-xs font-bold leading-5 text-white">
                  {unreadTexts}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <DeskTexts
          visible={tab === "texts"}
          canCall={phoneReady && !active}
          onCall={(to) => void placeCall(to)}
          onUnreadChange={setUnreadTexts}
        />

        {tab === "calendar" ? (
          <div className="mt-4">
            <AdminCalendarPageClient />
          </div>
        ) : null}

        {tab === "menu" ? (
          <div className="mt-5">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the menu"
              className="w-full max-w-md border border-line px-3 py-2"
            />
            <ul className="mt-4 divide-y divide-line">
              {visibleItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-semibold text-foreground">{item.name}</span>
                    <span className="text-sm text-muted">
                      {categoryName(item.category_id)} · ${item.variants?.[0]?.price ?? item.price}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    className="border border-line px-3 py-1.5 text-sm font-semibold"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "quote" || tab === "invoice" ? (
          <form className="mt-5 max-w-3xl" onSubmit={(event) => void send(tab, event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <label className="text-sm font-semibold text-foreground">
                Diet
                <select
                  value={diet}
                  onChange={(event) => setDiet(event.target.value as DietTag)}
                  className="mt-1 w-full border border-line bg-white px-3 py-2 font-medium"
                >
                  {DIETS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Event date" value={eventDate} onChange={setEventDate} type="date" />
              <Field label="Event time" value={eventTime} onChange={setEventTime} type="time" />
              <Field label="Guests" value={guests} onChange={setGuests} />
              <label className="text-sm font-semibold text-foreground">
                Service
                <select
                  value={service}
                  onChange={(event) => setService(event.target.value as "delivery" | "pickup")}
                  className="mt-1 w-full border border-line bg-white px-3 py-2 font-medium"
                >
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Pickup</option>
                </select>
              </label>
              <Field label="City" value={city} onChange={setCity} />
              <Field label="ZIP" value={zip} onChange={setZip} />
              <label className="text-sm font-semibold text-foreground sm:col-span-2">
                Address
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="mt-1 w-full border border-line px-3 py-2 font-medium"
                />
              </label>
              {service === "delivery" ? (
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={setupService}
                    onChange={(event) => setSetupService(event.target.checked)}
                  />
                  Full on-site setup (+${setupFee})
                </label>
              ) : null}
              <label className="text-sm font-semibold text-foreground sm:col-span-2">
                Notes
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-1 w-full border border-line px-3 py-2 font-medium"
                />
              </label>
            </div>

            <ul className="mt-5 divide-y divide-line">
              {lines.length === 0 ? (
                <li className="py-3 text-sm text-muted">Add dishes from the Menu tab.</li>
              ) : null}
              {lines.map((line) => (
                <li key={line.line_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-semibold text-foreground">
                    {line.name} · ${line.price}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="border border-line px-2"
                      onClick={() =>
                        setLines((current) =>
                          current
                            .map((row) =>
                              row.line_id === line.line_id
                                ? { ...row, quantity: row.quantity - 1 }
                                : row
                            )
                            .filter((row) => row.quantity > 0)
                        )
                      }
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      className="border border-line px-2"
                      onClick={() =>
                        setLines((current) =>
                          current.map((row) =>
                            row.line_id === line.line_id
                              ? { ...row, quantity: row.quantity + 1 }
                              : row
                          )
                        )
                      }
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {notice ? <p className="mt-4 text-sm text-accent-deep">{notice}</p> : null}
            <button
              type="submit"
              disabled={busy !== null}
              className="mt-4 bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === tab
                ? "Sending…"
                : tab === "quote"
                  ? "Email quote"
                  : "Send invoice"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="text-sm font-semibold text-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-line px-3 py-2 font-medium"
      />
    </label>
  );
}
