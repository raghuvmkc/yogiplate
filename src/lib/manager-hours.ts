const PACIFIC = "America/Los_Angeles";

/** Minutes from midnight in America/Los_Angeles. */
export function pacificMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

/** 0 = Sunday … 6 = Saturday in America/Los_Angeles. */
export function pacificWeekday(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** Manager desk hours: 10:30 AM – 9:00 PM Pacific, closed Mondays. */
export const MANAGER_START_MINUTES = 10 * 60 + 30; // 10:30 AM
export const MANAGER_END_MINUTES = 21 * 60; // 9:00 PM

export const MANAGER_HOURS_LABEL = "10:30 AM–9:00 PM PST";
export const MANAGER_CLOSED_DAY_LABEL = "Mondays";

/** True on Mondays (Pacific). */
export function isManagerClosedDay(now = new Date()): boolean {
  return pacificWeekday(now) === 1;
}

/** True before 10:30 AM Pacific on a day the manager is otherwise open. */
export function isBeforeManagerAvailable(now = new Date()): boolean {
  if (isManagerClosedDay(now)) return true;
  return pacificMinutesNow(now) < MANAGER_START_MINUTES;
}

export const MANAGER_EARLY_HOURS_NOTE =
  "Our manager is available 10:30 AM–9:00 PM PST, Tuesday–Sunday (closed Mondays). Outside those hours, AI Yogi can help you build a menu and quote — the manager will follow up afterwards.";
