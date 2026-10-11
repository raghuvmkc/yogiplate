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

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export type ResolvedEventDate = {
  iso: string;
  phrase: string;
  /** "next Sunday" can mean either date; ask the guest before saving. */
  options?: [string, string];
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

  const monthDay = lower.match(
    new RegExp(`\\b(${MONTHS.map((m) => m.slice(0, 3)).join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)
  );
  if (monthDay) {
    const month = MONTHS.findIndex((m) => m.startsWith(monthDay[1]!)) + 1;
    const day = Number(monthDay[2]);
    if (day >= 1 && day <= 31) {
      let year = today.year;
      if (month < today.month || (month === today.month && day < today.day)) year++;
      return { iso: toIso(year, month, day), phrase: monthDay[0] };
    }
  }

  const ordinal = lower.match(
    new RegExp(`\\b(?:(?:${WEEKDAYS.join("|")}),?\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b|\\b(?:${WEEKDAYS.join("|")}),?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)
  );
  if (ordinal) {
    const day = Number(ordinal[1] || ordinal[2]);
    if (day >= 1 && day <= 31) {
      let year = today.year;
      let month = today.month;
      if (day < today.day) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
      }
      return { iso: toIso(year, month, day), phrase: ordinal[0] };
    }
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const name = WEEKDAYS[i]!;
    const nextRe = new RegExp(`\\bnext\\s+${name}\\b`);
    const thisRe = new RegExp(`\\b(?:this|coming)\\s+${name}\\b`);
    const bareRe = new RegExp(`\\b${name}\\b`);

    if (nextRe.test(lower)) {
      const delta = weekdayOffset(today.dow, i, "next");
      const iso = addCivilDays(today.year, today.month, today.day, delta);
      return {
        iso,
        phrase: `next ${name}`,
        options: [iso, addCivilDays(today.year, today.month, today.day, delta + 7)],
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

/** "2026-10-10 (Saturday)" in the kitchen timezone. */
export function todayLabel(
  now: Date = new Date(),
  timeZone = "America/Los_Angeles"
): string {
  const t = localParts(now, timeZone);
  const name = WEEKDAYS[t.dow]!;
  return `${toIso(t.year, t.month, t.day)} (${name[0]!.toUpperCase()}${name.slice(1)})`;
}

/** Whole calendar days from today (kitchen timezone) to an ISO date; null if unparseable. */
export function daysUntilIso(
  iso: string,
  now: Date = new Date(),
  timeZone = "America/Los_Angeles"
): number | null {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const today = localParts(now, timeZone);
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((target - base) / 86_400_000);
}

/** "tomorrow, Sunday the 11th" style label for confirming a date out loud. */
export function spokenDateLabel(
  iso: string,
  now: Date = new Date(),
  timeZone = "America/Los_Angeles"
): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const day = Number(m[3]);
  const dow = WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, day)).getUTCDay()]!;
  const weekday = dow[0]!.toUpperCase() + dow.slice(1);
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] || "th";
  const diff = daysUntilIso(iso, now, timeZone);
  const prefix = diff === 0 ? "today, " : diff === 1 ? "tomorrow, " : "";
  return `${prefix}${weekday} the ${day}${suffix}`;
}
