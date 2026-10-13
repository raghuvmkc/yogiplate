"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { formatMoney } from "@/lib/pricing";
import type { BookingDetail } from "@/lib/booking-detail";

type IntentState = {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  publishableKey: string;
};

function CardForm({
  bookingId,
  amountLabel,
  paymentIntentId,
  onPaid,
  onCancel,
}: {
  bookingId: string;
  amountLabel: string;
  paymentIntentId: string;
  onPaid: (detail: BookingDetail) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: typeof window !== "undefined" ? window.location.href : undefined,
        },
      });
      if (result.error) {
        setError(result.error.message || "Card was declined.");
        return;
      }
      const status = result.paymentIntent?.status;
      if (status !== "succeeded") {
        setError(`Payment status is ${status || "unknown"}. Try again or record it manually.`);
        return;
      }
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "card_payment",
          payment_intent_id: paymentIntentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Card charged, but recording the payment failed. Refresh and check Payments.");
        return;
      }
      onPaid(data as BookingDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept this card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <p className="text-sm text-muted">
        Enter the guest&apos;s card for <span className="font-semibold text-foreground">{amountLabel}</span>.
        Card details stay with Stripe — they are not stored on Yogiplate.
      </p>
      <div className="border border-line bg-white px-3 py-3">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error ? <p className="text-sm text-[#8d3b32]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !stripe || !elements}
          className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Charging card…" : `Accept ${amountLabel}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Desk-side Stripe Elements form to take a card when the guest reads it over the phone. */
export function AdminCardPayment({
  bookingId,
  balance,
  hasOrder,
  onPaid,
}: {
  bookingId: string;
  balance: number;
  hasOrder: boolean;
  onPaid: (detail: BookingDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<IntentState | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (balance > 0) setAmount(String(Math.round(balance * 100) / 100));
  }, [balance]);

  const amountLabel = useMemo(() => formatMoney(Number(amount) || 0), [amount]);

  async function startCard() {
    setBusy(true);
    setError(null);
    setIntent(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/card-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not start card payment.");
        return;
      }
      setStripePromise(loadStripe(String(data.publishable_key)));
      setIntent({
        clientSecret: String(data.client_secret),
        paymentIntentId: String(data.payment_intent_id),
        amount: Number(data.amount) || 0,
        publishableKey: String(data.publishable_key),
      });
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start card payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasOrder) {
    return (
      <section className="mt-8 border border-line bg-white/60 px-4 py-4">
        <h4 className="font-display text-xl text-foreground">Accept card payment</h4>
        <p className="mt-2 text-sm text-muted">
          Save dishes as an order first, then you can enter the guest&apos;s card here.
        </p>
      </section>
    );
  }

  if (!(balance > 0)) {
    return (
      <section className="mt-8 border border-line bg-white/60 px-4 py-4">
        <h4 className="font-display text-xl text-foreground">Accept card payment</h4>
        <p className="mt-2 text-sm text-muted">This order is paid in full — nothing left to charge.</p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-accent/30 bg-accent-soft/30 px-4 py-4">
      <h4 className="font-display text-xl text-foreground">Accept card payment</h4>
      <p className="mt-1 text-sm text-muted">
        When the guest gives a card over the phone or in person, enter it here. Balance due{" "}
        {formatMoney(balance)}.
      </p>

      {!intent ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-foreground">
            Amount to charge
            <input
              type="number"
              min={0.5}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-40 border border-line bg-white px-3 py-2 font-medium"
            />
          </label>
          <button
            type="button"
            disabled={busy || !(Number(amount) > 0)}
            onClick={() => void startCard()}
            className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Enter card details"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[#8d3b32]">{error}</p> : null}

      {open && intent && stripePromise ? (
        <div className="mt-4">
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: intent.clientSecret,
              appearance: { theme: "stripe" },
            }}
          >
            <CardForm
              bookingId={bookingId}
              amountLabel={formatMoney(intent.amount)}
              paymentIntentId={intent.paymentIntentId}
              onPaid={(detail) => {
                setIntent(null);
                setOpen(false);
                onPaid(detail);
              }}
              onCancel={() => {
                setIntent(null);
                setOpen(false);
                setError(null);
              }}
            />
          </Elements>
          {amountLabel !== formatMoney(intent.amount) ? (
            <p className="mt-2 text-xs text-muted">Charging {formatMoney(intent.amount)}.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
