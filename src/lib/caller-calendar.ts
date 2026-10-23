import { adminCivilIso, adminTodayIso } from "@/lib/admin-time";
import { toE164 } from "@/lib/sms";
import { getDb } from "@/lib/store/local-db";
import type { CateringBooking } from "@/lib/types";

export type CalendarCallerMatch = {
  name: string;
  event_date: string;
  /** YYMMDD of the event date. */
  event_yymmdd: string;
  booking_id: string;
  phone: string;
};

type PhoneEvent = {
  name: string;
  event_date: string;
  booking_id: string;
  phone: string;
};

/** Last 10 digits so +14085551212 and 408-555-1212 match. */
export function phoneMatchKey(phone: string): string | null {
  let raw = String(phone || "").trim();
  if (!raw || raw.toLowerCase() === "anonymous" || raw.toLowerCase() === "unknown") {
    return null;
  }
  if (raw.startsWith("client:")) return null;
  const e164 = toE164(raw);
  const digits = (e164 || raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** YYYY-MM-DD → YYMMDD */
export function eventDateToYyMmDd(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || "").trim());
  if (!m) return "";
  return `${m[1]!.slice(2)}${m[2]}${m[3]}`;
}

export function formatCalendarCallerLabel(match: CalendarCallerMatch): string {
  const name = match.name.trim() || "Guest";
  return match.event_yymmdd ? `${name} · ${match.event_yymmdd}` : name;
}

function civilFromCallTime(startedAt: string): string {
  if (!startedAt) return adminTodayIso();
  // Already a civil date
  if (/^\d{4}-\d{2}-\d{2}$/.test(startedAt.trim())) return startedAt.trim();
  return adminCivilIso(startedAt) || adminTodayIso();
}

function daysApart(a: string, b: string): number {
  const aa = Date.parse(`${a}T12:00:00Z`);
  const bb = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(aa - bb) / 86_400_000;
}

function pickBestEvent(events: PhoneEvent[], aroundDate: string): PhoneEvent | null {
  if (!events.length) return null;
  return [...events].sort((a, b) => {
    const da = daysApart(a.event_date, aroundDate);
    const db = daysApart(b.event_date, aroundDate);
    if (da !== db) return da - db;
    // Tie-break: prefer upcoming / later event
    return b.event_date.localeCompare(a.event_date);
  })[0]!;
}

function rankBooking(booking: CateringBooking, today: string): number {
  if (booking.event_date >= today) {
    return 2_000_000_000 - Number(booking.event_date.replace(/-/g, ""));
  }
  return Number(booking.event_date.replace(/-/g, ""));
}

/** Collect every guest phone → event candidates from bookings, orders, and quotes. */
async function phoneEventIndex(): Promise<Map<string, PhoneEvent[]>> {
  const db = await getDb();
  const byKey = new Map<string, PhoneEvent[]>();

  function add(phone: string, name: string, eventDate: string, bookingId = "") {
    const key = phoneMatchKey(phone);
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate || "")) return;
    const list = byKey.get(key) || [];
    list.push({
      name: String(name || "").trim() || "Guest",
      event_date: eventDate,
      booking_id: bookingId,
      phone,
    });
    byKey.set(key, list);
  }

  for (const row of db.catering_bookings || []) {
    if (row.status === "cancelled") continue;
    add(row.customer_phone || "", row.customer_name || "", row.event_date, row.id);
  }
  for (const row of db.orders || []) {
    if (row.status === "cancelled") continue;
    add(row.customer_phone || "", row.customer_name || "", row.event_date);
  }
  for (const row of db.quotes || []) {
    if (row.status === "cancelled" || row.status === "expired") continue;
    add(row.customer_phone || "", row.customer_name || "", row.event_date, row.id);
  }
  for (const row of db.customers || []) {
    // CRM has no event date — skip for YYMMDD labels unless we only need a name.
    // Names without events are not enough for the Name · YYMMDD convention.
    void row;
  }

  return byKey;
}

/** Find a calendar guest whose phone matches the caller (live ring). */
export async function findCalendarCaller(
  phone: string
): Promise<CalendarCallerMatch | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null;
  const index = await phoneEventIndex();
  const events = index.get(key) || [];
  if (!events.length) return null;
  const today = adminTodayIso();
  // Prefer soonest upcoming, else most recent past.
  const ranked = [...events].sort((a, b) => {
    const fakeA = { event_date: a.event_date } as CateringBooking;
    const fakeB = { event_date: b.event_date } as CateringBooking;
    return rankBooking(fakeB, today) - rankBooking(fakeA, today);
  });
  const best = ranked[0]!;
  return {
    name: best.name,
    event_date: best.event_date,
    event_yymmdd: eventDateToYyMmDd(best.event_date),
    booking_id: best.booking_id,
    phone: best.phone || phone,
  };
}

/**
 * Label every call in history: Name · YYMMDD using the calendar event
 * closest to when that call happened.
 */
export async function enrichCallsWithCalendarLabels<
  T extends { from: string; to: string; direction: string; started_at: string },
>(calls: T[]): Promise<(T & { calendar_label: string | null })[]> {
  if (!calls.length) return [];
  const index = await phoneEventIndex();
  return calls.map((call) => {
    const who = call.direction.startsWith("outbound") ? call.to : call.from;
    const key = phoneMatchKey(who);
    if (!key) return { ...call, calendar_label: null };
    const events = index.get(key);
    if (!events?.length) return { ...call, calendar_label: null };
    const around = civilFromCallTime(call.started_at);
    const best = pickBestEvent(events, around);
    if (!best) return { ...call, calendar_label: null };
    return {
      ...call,
      calendar_label: formatCalendarCallerLabel({
        name: best.name,
        event_date: best.event_date,
        event_yymmdd: eventDateToYyMmDd(best.event_date),
        booking_id: best.booking_id,
        phone: best.phone || who,
      }),
    };
  });
}

/** @deprecated Prefer enrichCallsWithCalendarLabels for history rows. */
export async function calendarCallerLabelsForPhones(
  phones: string[]
): Promise<Record<string, string>> {
  const keys = new Map<string, string>();
  for (const phone of phones) {
    const key = phoneMatchKey(phone);
    if (key && !keys.has(key)) keys.set(key, phone);
  }
  if (!keys.size) return {};
  const index = await phoneEventIndex();
  const today = adminTodayIso();
  const out: Record<string, string> = {};
  for (const [key, samplePhone] of keys) {
    const events = index.get(key);
    if (!events?.length) continue;
    const best = pickBestEvent(events, today);
    if (!best) continue;
    out[key] = formatCalendarCallerLabel({
      name: best.name,
      event_date: best.event_date,
      event_yymmdd: eventDateToYyMmDd(best.event_date),
      booking_id: best.booking_id,
      phone: best.phone || samplePhone,
    });
  }
  return out;
}
