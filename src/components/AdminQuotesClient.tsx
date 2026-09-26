"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/pricing";
import type { Quote, Reminder } from "@/lib/types";

export function AdminQuotesClient({
  initialQuotes,
  initialReminders,
}: {
  initialQuotes: Quote[];
  initialReminders: Reminder[];
}) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [reminders, setReminders] = useState(initialReminders);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/quotes");
    if (!res.ok) return;
    const data = await res.json();
    setQuotes(data.quotes || []);
    setReminders(data.reminders || []);
  }

  async function resend(id: string) {
    setMsg(null);
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend_quote", quote_id: id }),
    });
    const data = await res.json();
    setMsg(data.sent ? "Quote email sent." : `Email not sent: ${data.reason || "failed"}`);
    void reload();
  }

  async function runReminders() {
    setMsg(null);
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process_reminders" }),
    });
    const data = await res.json();
    setMsg(`Processed ${data.processed ?? 0} reminder(s).`);
    void reload();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className="text-4xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Quotes & reminders
        </h1>
        <button
          type="button"
          onClick={() => void runReminders()}
          className="bg-accent-deep px-3 py-2 text-sm font-semibold text-white"
        >
          Process due reminders
        </button>
      </div>
      {msg ? <p className="mt-4 text-sm text-accent-deep">{msg}</p> : null}

      <h2 className="mt-10 text-lg font-semibold">Quotes</h2>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {quotes.map((q) => (
          <li
            key={q.id}
            className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm"
          >
            <div>
              <p className="font-medium">
                {q.quote_number} · {q.status}
              </p>
              <p className="text-muted">
                {q.customer_name} · {q.customer_email} · {q.event_date || "no date"}
              </p>
              <p className="text-muted">
                {formatMoney(q.food_subtotal)} food · deposit{" "}
                {formatMoney(q.deposit_amount)}
              </p>
              <Link
                href={`/quote/${q.id}?t=${q.public_token}`}
                className="text-accent-deep underline"
                target="_blank"
              >
                Public link
              </Link>
            </div>
            <button
              type="button"
              onClick={() => void resend(q.id)}
              className="border border-line px-3 py-1.5 text-xs font-semibold"
            >
              Resend email
            </button>
          </li>
        ))}
        {!quotes.length ? (
          <li className="py-6 text-sm text-muted">No quotes yet.</li>
        ) : null}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Reminders</h2>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {reminders.slice(0, 40).map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <p className="font-medium">
              {r.kind} · {r.status}
            </p>
            <p className="text-muted">
              Due {new Date(r.due_at).toLocaleString()} → {r.to_email}
            </p>
          </li>
        ))}
        {!reminders.length ? (
          <li className="py-6 text-sm text-muted">No reminders scheduled.</li>
        ) : null}
      </ul>
    </div>
  );
}
