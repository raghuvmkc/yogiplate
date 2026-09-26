"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/pricing";
import type { Quote } from "@/lib/types";

export default function PublicQuotePage() {
  const params = useParams();
  const search = useSearchParams();
  const id = String(params?.id || "");
  const token = search.get("t") || "";
  const depositFlag = search.get("deposit");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) {
      setError("This quote link is incomplete.");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/quotes/${id}?t=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error || "Quote not found");
        return;
      }
      setQuote(data.quote as Quote);
      if (depositFlag === "1") {
        setNote("Thank you — if your deposit payment completed, we will confirm by email shortly.");
      }
    })().catch(() => setError("Could not load quote"));
    return () => {
      cancelled = true;
    };
  }, [id, token, depositFlag]);

  async function payDeposit() {
    if (!quote) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deposit failed");
      if (data.url) {
        window.location.href = data.url as string;
        return;
      }
      if (data.demo || data.already_paid) {
        setNote(
          data.demo
            ? "Deposit recorded (demo mode — Stripe not configured)."
            : "Deposit already paid. Thank you!"
        );
        const refreshed = await fetch(
          `/api/quotes/${id}?t=${encodeURIComponent(token)}`
        );
        const body = await refreshed.json();
        if (refreshed.ok) setQuote(body.quote as Quote);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-warm">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-accent-deep">
          ← Yogiplate
        </Link>
        <h1
          className="mt-6 text-4xl tracking-tight"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Catering quote
        </h1>

        {error ? (
          <p className="mt-8 border border-line bg-white px-4 py-3 text-sm text-accent-deep">
            {error}
          </p>
        ) : null}

        {!error && !quote ? (
          <p className="mt-8 text-sm text-muted">Loading quote…</p>
        ) : null}

        {quote ? (
          <div className="mt-8 border border-line bg-white p-6">
            <p className="text-sm text-muted">
              {quote.quote_number} · {quote.status.replace(/_/g, " ")}
            </p>
            <p className="mt-2 text-lg font-medium">{quote.customer_name}</p>
            <p className="text-sm text-muted">
              Event {quote.event_date || "TBD"}
              {quote.event_time ? ` · ${quote.event_time}` : ""} ·{" "}
              {quote.guest_count || "TBD"} guests · {quote.diet_profile}
            </p>
            {quote.city ? (
              <p className="mt-1 text-sm text-muted">
                {quote.delivery_or_pickup || "service"} · {quote.city}
              </p>
            ) : null}

            <ul className="mt-6 divide-y divide-line border-t border-line">
              {quote.items.map((i) => (
                <li
                  key={`${i.menu_item_id}-${i.variant_id || ""}-${i.name}`}
                  className="flex justify-between gap-4 py-3 text-sm"
                >
                  <span>
                    {i.quantity}× {i.name}
                  </span>
                  <span>{formatMoney(i.unit_price * i.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-1 text-right text-sm">
              <p>Food estimate: {formatMoney(quote.food_subtotal)}</p>
              <p className="text-base font-semibold">
                Deposit ({quote.deposit_percent}%):{" "}
                {formatMoney(quote.deposit_amount)}
              </p>
              <p className="text-xs text-muted">
                Delivery and tax confirmed at full checkout. Expires{" "}
                {new Date(quote.expires_at).toLocaleDateString()}.
              </p>
            </div>

            {note ? (
              <p className="mt-4 text-sm font-medium text-accent-deep">{note}</p>
            ) : null}

            {quote.status === "deposit_paid" || quote.status === "accepted" ? (
              <p className="mt-6 text-sm font-semibold text-accent-deep">
                Deposit received — our kitchen will follow up to finalize your order.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void payDeposit()}
                className="mt-6 w-full bg-accent-deep px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-50"
              >
                {busy ? "Starting checkout…" : "Pay deposit"}
              </button>
            )}

            <p className="mt-4 text-center text-xs text-muted">
              Prefer to build the full menu yourself?{" "}
              <Link href="/order" className="text-accent-deep underline">
                Open Build order
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
