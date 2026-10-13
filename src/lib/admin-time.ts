/** Admin UI always shows kitchen / Pacific time, regardless of the browser locale (e.g. India). */

export const ADMIN_TZ = "America/Los_Angeles";
export const ADMIN_TZ_LABEL = "Pacific";

function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatAdminDateTime(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = asDate(value);
  if (!d) return value == null ? "" : String(value);
  return d.toLocaleString("en-US", {
    timeZone: ADMIN_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

export function formatAdminDate(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = asDate(value);
  if (!d) return value == null ? "" : String(value);
  return d.toLocaleDateString("en-US", {
    timeZone: ADMIN_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...opts,
  });
}

export function formatAdminTime(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = asDate(value);
  if (!d) return value == null ? "" : String(value);
  return d.toLocaleTimeString("en-US", {
    timeZone: ADMIN_TZ,
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

/** Compact call-log style: "Oct 12, 3:05 PM" in Pacific. */
export function formatAdminCallWhen(value: string | Date | null | undefined): string {
  return formatAdminDateTime(value, { year: undefined });
}

/** YYYY-MM-DD for "today" in Pacific (admin calendar / filters). */
export function adminTodayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Format a civil event date YYYY-MM-DD without shifting by browser TZ. */
export function formatAdminCivilDate(yyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || "").trim());
  if (!m) return yyyyMmDd || "";
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Show HH:mm event time with Pacific label (already kitchen wall time). */
export function formatAdminEventTime(hhMm: string | null | undefined): string {
  const raw = String(hhMm || "").trim();
  if (!raw) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return `${raw} ${ADMIN_TZ_LABEL}`;
  let hour = Number(m[1]);
  const minute = m[2];
  const ap = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ap} ${ADMIN_TZ_LABEL}`;
}

/** Local Date at noon for a Pacific civil YYYY-MM-DD (calendar cursor / “Today”). */
export function dateFromCivilIso(yyyyMmDd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || "").trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

export function adminTodayDate(now = new Date()): Date {
  return dateFromCivilIso(adminTodayIso(now));
}

/** YYYY-MM-DD of an instant in Pacific. */
export function adminCivilIso(value: string | Date): string {
  const d = asDate(value);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}
