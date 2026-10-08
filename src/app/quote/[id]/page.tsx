"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { STATEMENT_NOTE } from "@/lib/pay-email";
import { formatMoney, lineTotal } from "@/lib/pricing";
import {
  prettyDate,
  prettyLabel,
  prettyTime,
  deliveryAddressLine,
  resolveOccasion,
  serviceLine,
} from "@/lib/quote-format";
import type { Quote } from "@/lib/types";

export default function PublicQuotePage() {
  const params = useParams();
  const search = useSearchParams();
  const id = String(params?.id || "");
  const token = search.get("t") || "";
  const depositFlag = search.get("deposit");
  const sessionId = search.get("session_id") || "";

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
      if (sessionId) {
        const confirmed = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const paid = await confirmed.json();
        if (cancelled) return;
        if (confirmed.ok) {
          const refreshed = await fetch(
            `/api/quotes/${id}?t=${encodeURIComponent(token)}`
          );
          const body = await refreshed.json();
          if (!cancelled && refreshed.ok) setQuote(body.quote as Quote);
          setNote(
            `Payment received for order ${paid.order_number}. It is on the calendar, and invoice ${paid.invoice_number} is updated.`
          );
        } else if (depositFlag === "1") {
          setNote(paid.error || "Payment is not confirmed yet.");
        }
      } else if (depositFlag === "1") {
        setNote("Thank you — if your deposit payment completed, we will confirm by email shortly.");
      }
    })().catch(() => setError("Could not load quote"));
    return () => {
      cancelled = true;
    };
  }, [id, token, depositFlag, sessionId]);

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

        {error ? (
          <p className="mt-8 border border-line bg-white px-4 py-3 text-sm text-accent-deep">
            {error}
          </p>
        ) : null}

        {!error && !quote ? (
          <p className="mt-8 text-sm text-muted">Loading quote…</p>
        ) : null}

        {quote ? (
          <div className="mt-8 border border-line bg-white">
            <div className="border-b border-[#1e3d2f] bg-[#1e3d2f] px-6 py-1" />
            <div className="px-6 py-8 sm:px-8">
              <Image
                src="/images/Yogiplate_Logo_transparent.png"
                alt="Yogiplate"
                width={220}
                height={220}
                className="mx-auto h-auto w-40"
                priority
              />
              <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-logo-gold-deep">
                Catering quotation
              </p>
              <h1
                className="mt-2 text-center text-3xl text-accent-deep"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                Prepared for {quote.customer_name}
              </h1>
              <p className="mt-1 text-center text-sm text-muted">
                {quote.quote_number} · {quote.status.replace(/_/g, " ")}
              </p>

              <dl className="mt-8 space-y-2 border-t border-line pt-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">When</dt>
                  <dd className="text-right">
                    {[prettyDate(quote.event_date), prettyTime(quote.event_time)]
                      .filter(Boolean)
                      .join(" · ") || "To be confirmed"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Guests</dt>
                  <dd>{quote.guest_count || "To be confirmed"}</dd>
                </div>
                {resolveOccasion(quote) ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Occasion</dt>
                    <dd className="text-right">{resolveOccasion(quote)}</dd>
                  </div>
                ) : null}
                {quote.meal ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Meal</dt>
                    <dd>{prettyLabel(quote.meal)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Diet</dt>
                  <dd>{prettyLabel(quote.diet_profile)}</dd>
                </div>
                {serviceLine(quote) ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Service</dt>
                    <dd className="max-w-[16rem] text-right">{serviceLine(quote)}</dd>
                  </div>
                ) : null}
                {deliveryAddressLine(quote) ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Deliver to</dt>
                    <dd className="max-w-[16rem] text-right">{deliveryAddressLine(quote)}</dd>
                  </div>
                ) : null}
              </dl>

              {quote.special_requirements || quote.setup_needs ? (
                <div className="mt-5 border-l-[3px] border-accent-deep bg-[#f4f7f4] px-4 py-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-deep">
                    Special requests
                  </p>
                  <p className="mt-1 text-foreground">
                    {quote.special_requirements}
                    {quote.setup_needs &&
                    quote.setup_needs !== quote.special_requirements
                      ? ` Setup: ${quote.setup_needs}`
                      : ""}
                  </p>
                </div>
              ) : null}

              <h2
                className="mt-8 text-xl text-accent-deep"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                Proposed menu
              </h2>
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {quote.items.map((i) => (
                  <li
                    key={`${i.menu_item_id}-${i.variant_id || ""}-${i.name}`}
                    className="flex justify-between gap-4 py-3 text-sm"
                  >
                    <span>
                      {i.quantity}× {i.name}
                    </span>
                    <span>{formatMoney(lineTotal(i.unit_price, i.quantity))}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 space-y-1 text-right text-sm">
                <p>Food estimate: {formatMoney(quote.food_subtotal)}</p>
                <p className="text-base font-semibold text-accent-deep">
                  Deposit ({quote.deposit_percent}%):{" "}
                  {formatMoney(quote.deposit_amount)}
                </p>
                <p className="text-xs text-muted">
                  Delivery and tax confirmed when the order is finalized. Valid through{" "}
                  {new Date(quote.expires_at).toLocaleDateString()}.
                </p>
              </div>

              {quote.closing_message ? (
                <p
                  className="mt-8 border-t border-line pt-6 text-base italic leading-relaxed text-accent-deep"
                  style={{ fontFamily: "var(--font-display), Georgia, serif" }}
                >
                  {quote.closing_message}
                </p>
              ) : null}

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
              {quote.status === "deposit_paid" || quote.status === "accepted" ? null : (
                <p className="mt-2 text-center text-xs text-muted">{STATEMENT_NOTE}</p>
              )}

              <p className="mt-4 text-center text-xs text-muted">
                Prefer to build the full menu yourself?{" "}
                <Link href="/order" className="text-accent-deep underline">
                  Open Build order
                </Link>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
