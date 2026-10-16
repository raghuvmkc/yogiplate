export const KITCHEN_TZ = "America/Los_Angeles";

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function pinFromMonthDay(month: number, day: number) {
  const m = Math.floor(Number(month));
  const d = Math.floor(Number(day));
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error("Enter the birth month (1–12) and day (1–31).");
  }
  if (d > MONTH_DAYS[m - 1]) {
    throw new Error("That day does not exist in that month.");
  }
  return `${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

export function formatKitchenTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: KITCHEN_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatShiftLength(startIso: string, endIso: string) {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  let minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  return `${hours}h ${minutes}m`;
}

export function decimalHours(startIso: string, endIso: string) {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  return (ms / 3_600_000).toFixed(2);
}
