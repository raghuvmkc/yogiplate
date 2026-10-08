"use client";

import { FormEvent, useState } from "react";
import { useCartStore } from "@/lib/cart-store";
import { STATEMENT_NAME } from "@/lib/pay-email";

const inputClass =
  "mt-1 w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent";

/** Order builder option: email the guest an invoice with a pay link instead of paying now. */
export function EmailInvoiceOption(props: {
  disabled: boolean;
  onSent: (message: string) => void;
}) {
  const {
    contact,
    setContact,
    diet,
    items,
    guestCount,
    eventDate,
    eventTime,
    setEventTime,
    notes,
    clear,
  } = useCartStore();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openForm() {
    setName((v) => v || contact.name);
    setEmail((v) => v || contact.email);
    setPhone((v) => v || contact.phone);
    setOpen(true);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout/email-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          diet_profile: diet,
          event_date: eventDate,
          event_time: eventTime,
          guest_count: guestCount,
          delivery_or_pickup: mode,
          address,
          city,
          state: "CA",
          zip,
          notes,
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send the invoice. Please try again.");
        return;
      }
      setContact({ name, email, phone });
      clear();
      props.onSent(
        data.email_sent
          ? `Invoice ${data.invoice_number} is on its way to ${email}. Pay anytime from the link in the email — your date is held on our calendar.`
          : `Invoice ${data.invoice_number} is ready, but the email did not go through. You can pay here: ${data.pay_url}`
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={openForm}
        className="mt-2 w-full border border-accent-deep py-3 text-sm font-semibold text-accent-deep transition hover:bg-accent-soft disabled:pointer-events-none disabled:border-line disabled:text-muted"
      >
        Email me an invoice instead
      </button>
    );
  }

  return (
    <form onSubmit={send} className="mt-3 space-y-3 border border-line bg-warm p-3 text-sm">
      <p className="font-semibold text-foreground">Send the invoice to your email</p>
      <p className="text-xs text-muted">
        We&apos;ll email an itemized invoice with a secure pay button (card, Apple Pay, or Link). Pay when you&apos;re ready. The charge will appear on your statement as {STATEMENT_NAME}.
      </p>
      <label className="block">
        <span className="font-medium">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
      </label>
      <label className="block">
        <span className="font-medium">Email</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          autoComplete="email"
        />
      </label>
      <label className="block">
        <span className="font-medium">Phone</span>
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          pattern="[\d\s()+.\-]{10,}"
          title="Enter a phone number with at least 10 digits."
          className={inputClass}
          autoComplete="tel"
        />
      </label>
      <label className="block">
        <span className="font-medium">Event time</span>
        <input
          required
          type="time"
          value={eventTime}
          onChange={(e) => setEventTime(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex gap-4">
        {(["delivery", "pickup"] as const).map((option) => (
          <label key={option} className="flex items-center gap-1.5 capitalize">
            <input
              type="radio"
              name="invoice-mode"
              checked={mode === option}
              onChange={() => setMode(option)}
            />
            {option}
          </label>
        ))}
      </div>
      {mode === "delivery" ? (
        <>
          <label className="block">
            <span className="font-medium">Delivery address</span>
            <input required value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} autoComplete="street-address" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="font-medium">City</span>
              <input required value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} autoComplete="address-level2" />
            </label>
            <label className="block">
              <span className="font-medium">ZIP</span>
              <input required value={zip} onChange={(e) => setZip(e.target.value)} className={inputClass} autoComplete="postal-code" />
            </label>
          </div>
        </>
      ) : null}
      {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-accent-deep py-2.5 font-semibold text-white hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send invoice"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-xs text-muted underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
