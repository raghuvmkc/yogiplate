/** Resolve spoken/relative event dates to YYYY-MM-DD in kitchen timezone. */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type ResolvedEventDate = {
  iso: string;
  phrase: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekday = (map.weekday || "Sunday").toLowerCase();
  const dow = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    dow: dow >= 0 ? dow : 0,
  };
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Civil-calendar day add (timezone-independent once local Y-M-D is known). */
function addCivilDays(
  year: number,
  month: number,
  day: number,
  delta: number
): string {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayOffset(
  currentDow: number,
  targetDow: number,
  mode: "this" | "next"
): number {
  if (mode === "next") {
    let d = (targetDow - currentDow + 7) % 7;
    if (d === 0) d = 7;
    return d;
  }
  return (targetDow - currentDow + 7) % 7;
}

/**
 * Pull a relative or ISO event date from guest utterance.
 * Kitchen default: America/Los_Angeles.
 */
export function resolveRelativeEventDate(
  text: string,
  now: Date = new Date(),
  timeZone = "America/Los_Angeles"
): ResolvedEventDate | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, " ");

  const isoHit = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoHit) {
    const iso = `${isoHit[1]}-${isoHit[2]}-${isoHit[3]}`;
    return { iso, phrase: iso };
  }

  const today = localParts(now, timeZone);

  if (/\b(today|tonight)\b/.test(lower)) {
    return {
      iso: toIso(today.year, today.month, today.day),
      phrase: "today",
    };
  }
  if (/\btomorrow\b/.test(lower)) {
    return {
      iso: addCivilDays(today.year, today.month, today.day, 1),
      phrase: "tomorrow",
    };
  }

  const inDays = lower.match(/\bin\s+(\d{1,3})\s+days?\b/);
  if (inDays) {
    const n = Number(inDays[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 366) {
      return {
        iso: addCivilDays(today.year, today.month, today.day, n),
        phrase: `in ${n} day${n === 1 ? "" : "s"}`,
      };
    }
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const name = WEEKDAYS[i]!;
    const nextRe = new RegExp(`\\bnext\\s+${name}\\b`);
    const thisRe = new RegExp(`\\b(?:this|coming)\\s+${name}\\b`);
    const bareRe = new RegExp(`\\b${name}\\b`);

    if (nextRe.test(lower)) {
      const delta = weekdayOffset(today.dow, i, "next");
      return {
        iso: addCivilDays(today.year, today.month, today.day, delta),
        phrase: `next ${name}`,
      };
    }
    if (thisRe.test(lower)) {
      const delta = weekdayOffset(today.dow, i, "this");
      return {
        iso: addCivilDays(today.year, today.month, today.day, delta),
        phrase: `this ${name}`,
      };
    }
    // Bare weekday only with a date-ish cue (avoid "Thursday specials")
    if (
      bareRe.test(lower) &&
      /\b(on|for|by|until|event|date|schedule|book|coming)\b/.test(lower)
    ) {
      const delta = weekdayOffset(today.dow, i, "this");
      return {
        iso: addCivilDays(today.year, today.month, today.day, delta),
        phrase: name,
      };
    }
  }

  return null;
}
