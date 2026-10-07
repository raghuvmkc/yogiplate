"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cart-store";
import { cartSubtotal, chargeTotals, formatMoney, lineTotal } from "@/lib/pricing";
import { DIET_LABELS } from "@/lib/data/menu-seed";
import { prettyTime } from "@/lib/quote-format";

export function CheckoutForm() {
  const router = useRouter();
  const {
    diet,
    items,
    guestCount,
    eventDate,
    setEventDate,
    eventTime,
    setEventTime,
    notes,
    couponCode,
    setCouponCode,
    clear,
    contact,
    setContact,
  } = useCartStore();

  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("CA");
  const [zip, setZip] = useState("");
  const [quote, setQuote] = useState<{
    miles: number;
    delivery_fee: number;
    in_service: boolean;
    tax_rate?: number;
  } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const subtotal = useMemo(() => cartSubtotal(items), [items]);

  async function refreshQuote() {
    if (!address || !city || !zip) return;
    const res = await fetch("/api/delivery/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, city, state, zip, subtotal }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not quote delivery");
      return;
    }
    setQuote(data);
    setError("");
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode, subtotal }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDiscount(0);
      setCouponMsg(data.error || "Invalid coupon");
      return;
    }
    setDiscount(data.discount);
    setCouponMsg(`Applied: −${formatMoney(data.discount)}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!diet || !items.length) {
      setError("Your cart is empty.");
      return;
    }
    setLoading(true);
    setError("");
    setContact({ name, email, phone });
    try {
      if (!quote) await refreshQuote();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          delivery_address: address,
          delivery_city: city,
          delivery_state: state,
          delivery_zip: zip,
          diet_profile: diet,
          event_date: eventDate,
          event_time: eventTime,
          guest_count: guestCount,
          notes,
          coupon_code: couponCode || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Checkout failed");
        setLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      clear();
      router.push(
        `/order/success?order=${data.order_number}&invoice=${data.invoice_number}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!items.length || !diet) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <a href="/order" className="mt-4 inline-block text-accent-deep underline">
          Build an order
        </a>
      </div>
    );
  }

  const priced = chargeTotals({
    subtotal,
    discount,
    deliveryFee: quote?.delivery_fee ?? 0,
    taxRate: quote?.tax_rate ?? 0,
  });
  const deliveryFee = priced.delivery_fee;
  const tax = priced.tax;
  const total = priced.total;

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_360px] sm:px-6"
    >
      <div>
        <p className="eyebrow">Checkout</p>
        <h1 className="font-display mt-4 text-5xl text-foreground sm:text-6xl">
          Delivery & payment
        </h1>
        <p className="mt-4 text-lg font-medium text-muted">
          {DIET_LABELS[diet]} · {guestCount} guests · {eventDate || "date not set"}
          {eventTime ? ` at ${prettyTime(eventTime)}` : ""}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Event date</span>
            <input
              required
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Event time</span>
            <input
              required
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-base sm:col-span-2">
            <span className="font-semibold">Full name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Phone</span>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">Delivery address</span>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={refreshQuote}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">City</span>
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onBlur={refreshQuote}
              className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="font-medium">State</span>
              <input
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">ZIP</span>
              <input
                required
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                onBlur={refreshQuote}
                className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="Coupon code"
            className="flex-1 border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={applyCoupon}
            className="border border-accent-deep px-4 py-2 text-sm font-semibold text-accent-deep"
          >
            Apply
          </button>
        </div>
        {couponMsg ? (
          <p className="mt-2 text-sm text-accent">{couponMsg}</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {quote && !quote.in_service ? (
          <p className="mt-4 text-sm text-red-700">
            Address is outside our {quote.miles} mi quote / service radius.
          </p>
        ) : null}
      </div>

      <aside className="h-fit border border-line p-5 lg:sticky lg:top-24">
        <h3
          className="text-2xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Summary
        </h3>
        <ul className="mt-4 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.line_id || i.menu_item_id} className="flex justify-between gap-2">
              <span>
                {i.name} × {i.quantity}
              </span>
              <span>{formatMoney(lineTotal(i.price, i.quantity))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              Delivery{quote ? ` (${quote.miles} mi)` : ""}
            </span>
            <span>{quote ? formatMoney(deliveryFee) : "—"}</span>
          </div>
          {discount > 0 ? (
            <div className="flex justify-between text-accent">
              <span>Discount</span>
              <span>−{formatMoney(discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span>Est. tax</span>
            <span>{formatMoney(tax)}</span>
          </div>
          <div className="flex justify-between pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || (quote != null && !quote.in_service)}
          className="mt-6 w-full bg-accent-deep py-3 text-sm font-semibold text-white hover:bg-accent disabled:opacity-50"
        >
          {loading ? "Processing…" : "Pay with Stripe"}
        </button>
        <p className="mt-3 text-xs text-muted">
          Secure card payment through Stripe. Your invoice is emailed right
          after payment.
        </p>
      </aside>
    </form>
  );
}
