/** Deterministic portion multipliers for planning engine v1. */

export type MealKind = "lunch" | "dinner" | "brunch" | "snack";

export const PORTION_RULES = {
  /** Adult equivalent multipliers */
  adult: 1,
  kid: 0.65,
  toddler: 0.4,
  /** Meal appetite multipliers applied to adult-equivalent headcount */
  meal: {
    lunch: 1,
    dinner: 1.15,
    brunch: 1.05,
    snack: 0.55,
  } as Record<MealKind, number>,
  /** Extra buffer on tray counts */
  buffer_percent: 10,
  /** Minutes before meal_time to schedule single delivery when no timeline */
  delivery_lead_minutes: 20,
  /** Max distinct main dishes for general pool (variety) */
  max_main_variety: 4,
  /** Prefer this many trays per restrictive group when count > 0 */
  min_dedicated_trays: 1,
} as const;

export function adultEquivalent(input: {
  adults?: number;
  kids?: number;
  toddlers?: number;
  total?: number | null;
}): number {
  const adults = Math.max(0, input.adults ?? 0);
  const kids = Math.max(0, input.kids ?? 0);
  const toddlers = Math.max(0, input.toddlers ?? 0);
  let ae =
    adults * PORTION_RULES.adult +
    kids * PORTION_RULES.kid +
    toddlers * PORTION_RULES.toddler;
  if (ae <= 0 && input.total != null && input.total > 0) {
    ae = input.total * PORTION_RULES.adult;
  }
  return ae;
}

export function effectiveHeadcount(
  ae: number,
  meal?: MealKind | "" | null
): number {
  const m = (meal || "lunch") as MealKind;
  const mult = PORTION_RULES.meal[m] ?? 1;
  return ae * mult;
}

export function traysForServes(
  guestsToCover: number,
  servesPerTray: number,
  bufferPercent = PORTION_RULES.buffer_percent
): number {
  if (guestsToCover <= 0 || servesPerTray <= 0) return 0;
  const withBuffer = guestsToCover * (1 + bufferPercent / 100);
  return Math.max(1, Math.ceil(withBuffer / servesPerTray));
}

/** Subtract minutes from HH:mm; returns HH:mm. */
export function subtractMinutes(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let total = Number(m[1]) * 60 + Number(m[2]) - minutes;
  if (total < 0) total = 0;
  const h = Math.floor(total / 60) % 24;
  const min = total % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
