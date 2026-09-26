export type TimeContextInput = {
  event_date?: string;
  event_time?: string;
  guest_count?: number;
  timezone?: string;
  lead_time_hours?: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    weekday: map.weekday || "",
    year: map.year || "",
    month: map.month || "",
    day: map.day || "",
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
}

function mealWindow(hour: number | null): "brunch" | "lunch" | "dinner" | "unknown" {
  if (hour == null || Number.isNaN(hour)) return "unknown";
  if (hour >= 9 && hour < 11) return "brunch";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 22) return "dinner";
  return "unknown";
}

/** Parse YYYY-MM-DD and optional HH:mm as kitchen-local wall time → UTC Date. */
function eventToUtc(
  eventDate: string,
  eventTime: string | undefined,
  timeZone: string
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const [y, m, d] = eventDate.split("-").map(Number);
  let hh = 12;
  let mm = 0;
  if (eventTime && /^\d{1,2}:\d{2}/.test(eventTime)) {
    const [h, min] = eventTime.split(":").map(Number);
    hh = h;
    mm = min;
  }
  // Approximate LA offset (handles PST/PDT via iterative format check)
  let guess = new Date(Date.UTC(y, m - 1, d, hh + 8, mm));
  for (let i = 0; i < 3; i++) {
    const p = partsInTz(guess, timeZone);
    const localAsUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      p.hour,
      p.minute
    );
    const target = Date.UTC(y, m - 1, d, hh, mm);
    guess = new Date(guess.getTime() + (target - localAsUtc));
  }
  return guess;
}

export function runTimeContext(input: TimeContextInput = {}) {
  const timeZone = input.timezone || "America/Los_Angeles";
  const leadRequired = input.lead_time_hours ?? 48;
  const now = new Date();
  const nowP = partsInTz(now, timeZone);
  const nowLocal = `${nowP.weekday}, ${nowP.year}-${nowP.month}-${nowP.day} ${pad(nowP.hour)}:${pad(nowP.minute)} ${timeZone}`;

  let eventUtc: Date | null = null;
  let eventHour: number | null = null;
  if (input.event_date) {
    eventUtc = eventToUtc(input.event_date, input.event_time, timeZone);
    if (input.event_time && /^\d{1,2}:\d{2}/.test(input.event_time)) {
      eventHour = Number(input.event_time.split(":")[0]);
    } else if (eventUtc) {
      eventHour = partsInTz(eventUtc, timeZone).hour;
    }
  }

  let lead_hours: number | null = null;
  let lead_days: number | null = null;
  let meets_lead_time: boolean | null = null;
  if (eventUtc) {
    lead_hours = Math.round((eventUtc.getTime() - now.getTime()) / 36e5);
    lead_days = Math.round((lead_hours / 24) * 10) / 10;
    meets_lead_time = lead_hours >= leadRequired;
  }

  const meal = mealWindow(eventHour);
  const is_weekend =
    nowP.weekday === "Saturday" || nowP.weekday === "Sunday";

  const summaryParts = [
    `Kitchen time now: ${nowLocal}.`,
    input.event_date
      ? `Event ${input.event_date}${input.event_time ? ` ${input.event_time}` : ""} → ~${lead_hours ?? "?"}h lead (${lead_days ?? "?"} days); meal window: ${meal}.`
      : "No event date provided.",
    meets_lead_time === null
      ? `Standard lead time policy: ${leadRequired} hours.`
      : meets_lead_time
        ? `Meets ${leadRequired}h lead-time policy.`
        : `Does NOT meet ${leadRequired}h lead-time policy — tell the guest you must check with Mr. Radhavallabh (Chef and Founder) before confirming; do not promise the date; offer WhatsApp handoff and/or a later date.`,
  ];

  return {
    ok: true,
    tool: "time_context",
    timezone: timeZone,
    now_iso: now.toISOString(),
    now_local: nowLocal,
    is_weekend,
    event_date: input.event_date || null,
    event_time: input.event_time || null,
    meal_window: meal,
    lead_hours,
    lead_days,
    lead_time_required_hours: leadRequired,
    meets_lead_time,
    guest_count: input.guest_count ?? null,
    summary: summaryParts.join(" "),
  };
}
