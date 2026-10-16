"use client";

import { useState } from "react";
import { formatKitchenTime } from "@/lib/staff-time";
import type { StaffSnapshot } from "@/lib/staff";

export function AdminStaffClient({ initial }: { initial: StaffSnapshot }) {
  const [data, setData] = useState(initial);
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = (await res.json()) as StaffSnapshot & { error?: string };
      if (!res.ok) throw new Error(next.error || "Could not save.");
      setData(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-4xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Kitchen hours
          </h1>
          <p className="mt-2 text-sm text-muted">
            Clock is at /employee. The code is the birth month and day, such as 0305 for March 5.
          </p>
        </div>
        <a
          href="/api/admin/staff/export"
          className="border border-accent-deep px-4 py-2 text-sm font-semibold text-accent-deep"
        >
          Export all history
        </a>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

      <section className="mt-8 border border-line bg-white p-4">
        <h2 className="text-lg font-semibold">In the kitchen now ({data.open.length})</h2>
        {data.open.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.open.map((row) => (
              <li key={row.punch_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-muted">
                    {" "}
                    · in since {formatKitchenTime(row.in_at)} · {row.so_far}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "clock_out", punch_id: row.punch_id })}
                  className="border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Clock out
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nobody is clocked in.</p>
        )}
      </section>

      <section className="mt-8 border border-line bg-white p-4">
        <h2 className="text-lg font-semibold">Add someone</h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void post({ name, month: Number(month), day: Number(day), active: true }).then((ok) => {
              if (ok) {
                setName("");
                setMonth("");
                setDay("");
              }
            });
          }}
        >
          <label className="text-sm font-semibold sm:col-span-2">
            Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full border border-line px-3 py-2 font-medium"
            />
          </label>
          <label className="text-sm font-semibold">
            Birth month
            <input
              required
              inputMode="numeric"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              placeholder="3"
              className="mt-1 w-full border border-line px-3 py-2 font-medium"
            />
          </label>
          <label className="text-sm font-semibold">
            Birth day
            <input
              required
              inputMode="numeric"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              placeholder="5"
              className="mt-1 w-full border border-line px-3 py-2 font-medium"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-4 sm:w-fit"
          >
            Save employee
          </button>
        </form>
        <ul className="mt-4 divide-y divide-line text-sm">
          {data.employees.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {person.name}{" "}
                <span className="text-muted">
                  · code {person.pin}
                  {person.active ? "" : " · inactive"}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void post({
                    id: person.id,
                    name: person.name,
                    month: Number(person.pin.slice(0, 2)),
                    day: Number(person.pin.slice(2)),
                    active: !person.active,
                  })
                }
                className="text-xs font-semibold text-accent-deep underline disabled:opacity-50"
              >
                {person.active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border border-line bg-white p-4">
        <h2 className="text-lg font-semibold">Recent shifts</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">In</th>
                <th className="py-2 pr-3 font-semibold">Out</th>
                <th className="py-2 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => (
                <tr key={row.punch_id} className="border-b border-line/70">
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{formatKitchenTime(row.in_at)}</td>
                  <td className="py-2 pr-3">
                    {row.out_at ? formatKitchenTime(row.out_at) : "Still in"}
                  </td>
                  <td className="py-2">{row.length || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
