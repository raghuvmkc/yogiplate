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

/** Manager desk hours: 10:30 AM – 9:00 PM Pacific. */
export const MANAGER_START_MINUTES = 10 * 60 + 30; // 10:30 AM
export const MANAGER_END_MINUTES = 21 * 60; // 9:00 PM

/** True before 10:30 AM Pacific — show the early-hours note in AI Yogi. */
export function isBeforeManagerAvailable(now = new Date()): boolean {
  return pacificMinutesNow(now) < MANAGER_START_MINUTES;
}

export const MANAGER_EARLY_HOURS_NOTE =
  "Our manager is available 10:30 AM–9:00 PM PST. Before then, AI Yogi can help you build a menu and quote — the manager will follow up afterwards.";
