"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminCateringCalendar } from "@/components/AdminCateringCalendar";
import type { CalendarBlock } from "@/lib/types";

export function AdminCalendarPageClient() {
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [settings, setSettings] = useState({
    lead_time_hours: 48,
    max_guests_per_day: 200,
    hold_ttl_minutes: 120,
  });
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("blackout");
  const [notes, setNotes] = useState("");
  const [guestCount, setGuestCount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockKey, setBlockKey] = useState(0);

  async function loadBlocks() {
    const res = await fetch("/api/admin/calendar");
    if (!res.ok) return;
    const data = await res.json();
    setBlocks(data.blocks || []);
    if (data.settings) setSettings(data.settings);
  }

  useEffect(() => {
    void loadBlocks();
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          kind,
          notes,
          guest_count: Number(guestCount) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add");
        return;
      }
      setNotes("");
      await loadBlocks();
      setBlockKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/calendar?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await loadBlocks();
    setBlockKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Operations</p>
      <h1 className="font-display mt-3 text-4xl text-foreground">
        Catering calendar
      </h1>
      <p className="lede mt-3 max-w-2xl">
        Chat dates land here as amber unconfirmed bookings. Paid / confirmed
        orders turn green. Admins can edit every field. Lead time{" "}
        {settings.lead_time_hours}h · ~{settings.max_guests_per_day} guests/day.
      </p>

      <div className="mt-10" key={blockKey}>
        <AdminCateringCalendar />
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="font-display text-2xl text-foreground">
          Kitchen blackouts & holds
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Capacity blocks AI Yogi checks before promising a date (holds last{" "}
          {settings.hold_ttl_minutes} min).
        </p>

        <form
          onSubmit={onAdd}
          className="mt-6 grid max-w-xl gap-3 border border-line bg-warm p-5 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-1">
            <span className="font-semibold">Date</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2"
            >
              <option value="blackout">Blackout</option>
              <option value="blocked">Blocked</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Guests</span>
            <input
              type="number"
              min={0}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2"
              placeholder="Temple event / kitchen closed…"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2"
          >
            {busy ? "Saving…" : "Add block"}
          </button>
          {error ? (
            <p className="text-sm font-medium text-red-700 sm:col-span-2">
              {error}
            </p>
          ) : null}
        </form>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Kind</th>
                <th className="py-2 pr-3 font-semibold">Guests</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Notes</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id} className="border-b border-line/70">
                  <td className="py-3 pr-3 font-medium">{b.date}</td>
                  <td className="py-3 pr-3 capitalize">{b.kind}</td>
                  <td className="py-3 pr-3">{b.guest_count}</td>
                  <td className="py-3 pr-3">{b.status}</td>
                  <td className="py-3 pr-3 text-muted">{b.notes || "—"}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(b.id)}
                      className="text-sm font-semibold text-accent-deep underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!blocks.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-muted">
                    No blackout/hold blocks yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
