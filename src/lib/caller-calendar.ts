import { adminTodayIso } from "@/lib/admin-time";
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

/** Last 10 digits so +14085551212 and 408-555-1212 match. */
export function phoneMatchKey(phone: string): string | null {
  const e164 = toE164(phone);
  const digits = (e164 || phone || "").replace(/\D/g, "");
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

function rankBooking(booking: CateringBooking, today: string): number {
  // Upcoming first (sooner = higher), then recent past (later = higher).
  if (booking.event_date >= today) {
    return 2_000_000_000 - Number(booking.event_date.replace(/-/g, ""));
  }
  return Number(booking.event_date.replace(/-/g, ""));
}

/** Find a calendar guest whose phone matches the caller. */
export async function findCalendarCaller(
  phone: string
): Promise<CalendarCallerMatch | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null;
  const db = await getDb();
  const today = adminTodayIso();
  const hits = (db.catering_bookings || []).filter((row) => {
    if (row.status === "cancelled") return false;
    const bookingKey = phoneMatchKey(row.customer_phone || "");
    return bookingKey === key;
  });
  if (!hits.length) {
    // Fall back to orders if the booking phone was empty but the order has it.
    const orderHits = db.orders.filter((row) => {
      if (row.status === "cancelled") return false;
      return phoneMatchKey(row.customer_phone || "") === key;
    });
    if (!orderHits.length) return null;
    orderHits.sort((a, b) => b.event_date.localeCompare(a.event_date));
    const order = orderHits[0]!;
    const yymmdd = eventDateToYyMmDd(order.event_date);
    return {
      name: order.customer_name || "Guest",
      event_date: order.event_date,
      event_yymmdd: yymmdd,
      booking_id: "",
      phone: order.customer_phone || phone,
    };
  }
  hits.sort((a, b) => rankBooking(b, today) - rankBooking(a, today));
  const booking = hits[0]!;
  return {
    name: booking.customer_name || "Guest",
    event_date: booking.event_date,
    event_yymmdd: eventDateToYyMmDd(booking.event_date),
    booking_id: booking.id,
    phone: booking.customer_phone || phone,
  };
}

/** Map several phone numbers → calendar label in one pass (call history). */
export async function calendarCallerLabelsForPhones(
  phones: string[]
): Promise<Record<string, string>> {
  const keys = new Map<string, string>();
  for (const phone of phones) {
    const key = phoneMatchKey(phone);
    if (key && !keys.has(key)) keys.set(key, phone);
  }
  if (!keys.size) return {};

  const db = await getDb();
  const today = adminTodayIso();
  const byKey = new Map<string, CateringBooking[]>();
  for (const row of db.catering_bookings || []) {
    if (row.status === "cancelled") continue;
    const key = phoneMatchKey(row.customer_phone || "");
    if (!key || !keys.has(key)) continue;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }

  const out: Record<string, string> = {};
  for (const [key, samplePhone] of keys) {
    const list = byKey.get(key);
    if (list?.length) {
      list.sort((a, b) => rankBooking(b, today) - rankBooking(a, today));
      const booking = list[0]!;
      out[key] = formatCalendarCallerLabel({
        name: booking.customer_name || "Guest",
        event_date: booking.event_date,
        event_yymmdd: eventDateToYyMmDd(booking.event_date),
        booking_id: booking.id,
        phone: booking.customer_phone || samplePhone,
      });
      continue;
    }
    const order = db.orders
      .filter(
        (row) =>
          row.status !== "cancelled" && phoneMatchKey(row.customer_phone || "") === key
      )
      .sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
    if (order) {
      out[key] = formatCalendarCallerLabel({
        name: order.customer_name || "Guest",
        event_date: order.event_date,
        event_yymmdd: eventDateToYyMmDd(order.event_date),
        booking_id: "",
        phone: order.customer_phone || samplePhone,
      });
    }
  }
  return out;
}
