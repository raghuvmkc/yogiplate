"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { CalendarBlock, CateringBooking } from "@/lib/types";

type ViewMode = "year" | "month" | "week" | "day";

const STATUS_STYLE: Record<
  string,
  { bg: string; border: string; label: string }
> = {
  unconfirmed: {
    bg: "bg-amber-100",
    border: "border-amber-400",
    label: "Unconfirmed",
  },
  confirmed: {
    bg: "bg-emerald-100",
    border: "border-emerald-500",
    label: "Confirmed",
  },
  cancelled: {
    bg: "bg-stone-100",
    border: "border-stone-300",
    label: "Cancelled",
  },
};

function bookingColor(status: string) {
  return STATUS_STYLE[status] || STATUS_STYLE.unconfirmed!;
}

type CreateDraft = {
  event_date: string;
  event_time: string;
  status: CateringBooking["status"];
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  guest_count: string;
  diet: string;
  occasion: string;
  special_requirements: string;
  notes: string;
};

const EMPTY_CREATE: CreateDraft = {
  event_date: "",
  event_time: "",
  status: "unconfirmed",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  guest_count: "",
  diet: "",
  occasion: "",
  special_requirements: "",
  notes: "",
};

export function AdminCateringCalendar() {
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [bookings, setBookings] = useState<CateringBooking[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CateringBooking | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateDraft>(EMPTY_CREATE);

  const range = useMemo(() => {
    if (view === "year") {
      return { from: format(startOfYear(cursor), "yyyy-MM-dd"), to: format(endOfYear(cursor), "yyyy-MM-dd") };
    }
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      const e = endOfWeek(cursor, { weekStartsOn: 0 });
      return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
    }
    if (view === "day") {
      const d = format(cursor, "yyyy-MM-dd");
      return { from: d, to: d };
    }
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return { from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
  }, [cursor, view]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(
          `/api/admin/bookings?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
        ),
        fetch("/api/admin/calendar"),
      ]);
      if (!bRes.ok || !cRes.ok) {
        setError("Could not load calendar (are you logged in?)");
        return;
      }
      const bData = await bRes.json();
      const cData = await cRes.json();
      setBookings(bData.bookings || []);
      setBlocks(cData.blocks || []);
    } catch {
      setError("Could not load calendar");
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  function shift(dir: -1 | 1) {
    if (view === "year") setCursor((d) => addYears(d, dir));
    else if (view === "week") setCursor((d) => addWeeks(d, dir));
    else if (view === "day") setCursor((d) => addDays(d, dir));
    else setCursor((d) => addMonths(d, dir));
  }

  const daysInView = useMemo(() => {
    if (view === "year") {
      return eachDayOfInterval({
        start: startOfYear(cursor),
        end: endOfYear(cursor),
      });
    }
    if (view === "week") {
      return eachDayOfInterval({
        start: startOfWeek(cursor, { weekStartsOn: 0 }),
        end: endOfWeek(cursor, { weekStartsOn: 0 }),
      });
    }
    if (view === "day") return [cursor];
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
    });
  }, [cursor, view]);

  function bookingsOn(day: Date) {
    const key = format(day, "yyyy-MM-dd");
    return bookings.filter((b) => b.event_date === key);
  }

  function blocksOn(day: Date) {
    const key = format(day, "yyyy-MM-dd");
    return blocks.filter((b) => b.date === key && b.status === "active");
  }

  async function saveSelected(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Save failed");
        return;
      }
      const data = await res.json();
      setSelected(data.booking);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function createBooking(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: createForm.event_date,
          event_time: createForm.event_time || null,
          status: createForm.status,
          customer_name: createForm.customer_name,
          customer_email: createForm.customer_email,
          customer_phone: createForm.customer_phone,
          guest_count: createForm.guest_count
            ? Number(createForm.guest_count)
            : null,
          diet: createForm.diet || undefined,
          occasion: createForm.occasion || undefined,
          special_requirements: createForm.special_requirements || undefined,
          notes: createForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not create booking");
        return;
      }
      const data = await res.json();
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      setSelected(data.booking || null);
      if (createForm.event_date) {
        setCursor(new Date(`${createForm.event_date}T12:00:00`));
        setView("day");
      }
      await load();
    } finally {
      setCreating(false);
    }
  }

  const title =
    view === "year"
      ? format(cursor, "yyyy")
      : view === "month"
        ? format(cursor, "MMMM yyyy")
        : view === "week"
          ? `Week of ${format(startOfWeek(cursor, { weekStartsOn: 0 }), "MMM d, yyyy")}`
          : format(cursor, "EEEE, MMM d, yyyy");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["year", "month", "week", "day"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-semibold capitalize ${
                view === v
                  ? "bg-accent-deep text-white"
                  : "border border-line text-muted hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateForm((f) => ({
                ...f,
                event_date: f.event_date || format(cursor, "yyyy-MM-dd"),
              }));
            }}
            className="bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white"
          >
            {showCreate ? "Close form" : "Add booking"}
          </button>
          <button
            type="button"
            onClick={() => shift(-1)}
            className="border border-line px-3 py-1.5 text-sm font-semibold"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="border border-line px-3 py-1.5 text-sm font-semibold"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="border border-line px-3 py-1.5 text-sm font-semibold"
          >
            Next
          </button>
        </div>
      </div>

      {showCreate ? (
        <form
          onSubmit={(e) => void createBooking(e)}
          className="grid gap-3 border border-line bg-warm p-5 sm:grid-cols-2"
        >
          <p className="eyebrow sm:col-span-2">New booking</p>
          <label className="block text-sm">
            <span className="font-semibold">Event date</span>
            <input
              required
              type="date"
              value={createForm.event_date}
              onChange={(e) =>
                setCreateForm({ ...createForm, event_date: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Status</span>
            <select
              value={createForm.status}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  status: e.target.value as CateringBooking["status"],
                })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            >
              <option value="unconfirmed">Unconfirmed (amber)</option>
              <option value="confirmed">Confirmed (green)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Name</span>
            <input
              required
              value={createForm.customer_name}
              onChange={(e) =>
                setCreateForm({ ...createForm, customer_name: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Phone</span>
            <input
              value={createForm.customer_phone}
              onChange={(e) =>
                setCreateForm({ ...createForm, customer_phone: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Email</span>
            <input
              type="email"
              value={createForm.customer_email}
              onChange={(e) =>
                setCreateForm({ ...createForm, customer_email: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Guests</span>
            <input
              type="number"
              min={0}
              value={createForm.guest_count}
              onChange={(e) =>
                setCreateForm({ ...createForm, guest_count: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Time</span>
            <input
              value={createForm.event_time}
              onChange={(e) =>
                setCreateForm({ ...createForm, event_time: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
              placeholder="HH:mm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Diet</span>
            <input
              value={createForm.diet}
              onChange={(e) =>
                setCreateForm({ ...createForm, diet: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
              placeholder="Jain / vegan / …"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Occasion</span>
            <input
              value={createForm.occasion}
              onChange={(e) =>
                setCreateForm({ ...createForm, occasion: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Special requirements</span>
            <textarea
              rows={2}
              value={createForm.special_requirements}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  special_requirements: e.target.value,
                })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Notes</span>
            <input
              value={createForm.notes}
              onChange={(e) =>
                setCreateForm({ ...createForm, notes: e.target.value })
              }
              className="mt-1 w-full border border-line bg-white px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2"
          >
            {creating ? "Creating…" : "Create booking"}
          </button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-foreground">{title}</h2>
        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-amber-400 bg-amber-100" />
            Unconfirmed (chat)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-emerald-500 bg-emerald-100" />
            Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-rose-300 bg-rose-50" />
            Blackout / hold
          </span>
        </div>
      </div>

      {error ? (
        <p className="text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {view === "year" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, m) => {
            const monthDate = new Date(cursor.getFullYear(), m, 1);
            const monthDays = eachDayOfInterval({
              start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 }),
              end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 }),
            });
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setCursor(monthDate);
                  setView("month");
                }}
                className="border border-line bg-warm p-3 text-left transition hover:border-accent"
              >
                <p className="text-sm font-semibold">{format(monthDate, "MMMM")}</p>
                <div className="mt-2 grid grid-cols-7 gap-0.5 text-[10px]">
                  {monthDays.map((d) => {
                    const hits = bookingsOn(d);
                    const inMonth = isSameMonth(d, monthDate);
                    const conf = hits.some((h) => h.status === "confirmed");
                    const unconf = hits.some((h) => h.status === "unconfirmed");
                    return (
                      <span
                        key={d.toISOString()}
                        className={`flex h-5 items-center justify-center ${
                          !inMonth
                            ? "text-muted/40"
                            : conf
                              ? "bg-emerald-100 font-semibold text-emerald-800"
                              : unconf
                                ? "bg-amber-100 font-semibold text-amber-900"
                                : ""
                        }`}
                      >
                        {format(d, "d")}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={`grid gap-px border border-line bg-line ${
            view === "day" ? "grid-cols-1" : "grid-cols-7"
          }`}
        >
          {view !== "day"
            ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="bg-warm px-2 py-1.5 text-xs font-semibold text-muted"
                >
                  {d}
                </div>
              ))
            : null}
          {daysInView.map((day) => {
            const hits = bookingsOn(day);
            const dayBlocks = blocksOn(day);
            const muted =
              view === "month" && !isSameMonth(day, cursor) ? "opacity-40" : "";
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[7.5rem] bg-white p-2 ${muted} ${
                  isSameDay(day, new Date()) ? "ring-2 ring-inset ring-accent" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCursor(day);
                    setView("day");
                  }}
                  className="text-xs font-semibold text-foreground"
                >
                  {format(day, view === "day" ? "EEEE MMM d" : "d")}
                </button>
                <div className="mt-1 space-y-1">
                  {dayBlocks.map((b) => (
                    <div
                      key={b.id}
                      className="border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-900"
                      title={b.notes || b.kind}
                    >
                      {b.kind}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </div>
                  ))}
                  {hits.map((b) => {
                    const style = bookingColor(b.status);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelected(b)}
                        className={`w-full border px-1.5 py-1 text-left text-[10px] leading-snug ${style.bg} ${style.border}`}
                      >
                        <span className="font-semibold">
                          {b.event_time ? `${b.event_time} · ` : ""}
                          {b.customer_name || "Guest"}
                        </span>
                        <span className="block truncate text-muted">
                          {b.guest_count ? `${b.guest_count} guests` : ""}
                          {b.diet ? ` · ${b.diet}` : ""}
                          {b.occasion ? ` · ${b.occasion}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <form
          onSubmit={(e) => void saveSelected(e)}
          className="border border-line bg-warm p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Booking detail</p>
              <h3 className="font-display mt-1 text-2xl text-foreground">
                {selected.customer_name || "Guest"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {bookingColor(selected.status).label} · {selected.event_date}
                {selected.event_time ? ` ${selected.event_time}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm font-semibold text-accent-deep underline"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Status</span>
              <select
                value={selected.status}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    status: e.target.value as CateringBooking["status"],
                  })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              >
                <option value="unconfirmed">Unconfirmed (amber)</option>
                <option value="confirmed">Confirmed (green)</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Event date</span>
              <input
                type="date"
                value={selected.event_date}
                onChange={(e) =>
                  setSelected({ ...selected, event_date: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Event time</span>
              <input
                value={selected.event_time || ""}
                onChange={(e) =>
                  setSelected({ ...selected, event_time: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
                placeholder="HH:mm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Guests</span>
              <input
                type="number"
                value={selected.guest_count ?? ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    guest_count: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Name</span>
              <input
                value={selected.customer_name}
                onChange={(e) =>
                  setSelected({ ...selected, customer_name: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Phone</span>
              <input
                value={selected.customer_phone}
                onChange={(e) =>
                  setSelected({ ...selected, customer_phone: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Email</span>
              <input
                value={selected.customer_email}
                onChange={(e) =>
                  setSelected({ ...selected, customer_email: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Diet</span>
              <input
                value={selected.diet || ""}
                onChange={(e) =>
                  setSelected({ ...selected, diet: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Occasion</span>
              <input
                value={selected.occasion || ""}
                onChange={(e) =>
                  setSelected({ ...selected, occasion: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Meal</span>
              <input
                value={selected.meal || ""}
                onChange={(e) =>
                  setSelected({ ...selected, meal: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Delivery / pickup</span>
              <select
                value={selected.delivery_or_pickup || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    delivery_or_pickup: e.target.value,
                  })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              >
                <option value="">—</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Address</span>
              <input
                value={
                  [selected.address, selected.city].filter(Boolean).join(", ") ||
                  ""
                }
                onChange={(e) =>
                  setSelected({ ...selected, address: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Special requirements</span>
              <textarea
                rows={2}
                value={selected.special_requirements || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    special_requirements: e.target.value,
                  })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Setup needs</span>
              <textarea
                rows={2}
                value={selected.setup_needs || ""}
                onChange={(e) =>
                  setSelected({ ...selected, setup_needs: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Menu / items</span>
              <textarea
                rows={2}
                value={selected.items_summary || ""}
                onChange={(e) =>
                  setSelected({ ...selected, items_summary: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Notes</span>
              <textarea
                rows={2}
                value={selected.notes || ""}
                onChange={(e) =>
                  setSelected({ ...selected, notes: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Admin notes</span>
              <textarea
                rows={2}
                value={selected.admin_notes || ""}
                onChange={(e) =>
                  setSelected({ ...selected, admin_notes: e.target.value })
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
            {selected.quote_id ? <span>Quote: {selected.quote_id}</span> : null}
            {selected.order_id ? <span>Order: {selected.order_id}</span> : null}
            {selected.chat_session_id ? (
              <span>Chat: {selected.chat_session_id}</span>
            ) : null}
            {selected.food_subtotal != null ? (
              <span>Food est: ${selected.food_subtotal.toFixed(2)}</span>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
