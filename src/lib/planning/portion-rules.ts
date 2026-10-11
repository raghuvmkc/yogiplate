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

/** Serving rules for units that have no `serves` on the variant. Tune here. */
export const UNIT_RULES = {
  pizza: {
    slices_by_size: { "10": 6, "12": 8, "14": 8 } as Record<string, number>,
    default_slices: 8,
    slices_per_guest: 3,
    default_size: "14",
  },
  /** Pieces per guest when the item is sold per piece, by course. */
  pieces_per_guest: {
    appetizer: 2,
    chaat: 2,
    bread: 2,
    dessert: 1,
    default: 1,
  } as Record<string, number>,
  /** Ounces per guest for items sold by volume, by course. */
  oz_per_guest: {
    drink: 12,
    soup: 8,
    dal: 6,
    condiment: 1,
    default: 4,
  } as Record<string, number>,
  appetite: { light: 0.85, regular: 1, hearty: 1.2 } as Record<string, number>,
} as const;

type VariantLike = { id: string; label: string; price: number; unit?: string; serves?: number };
type ItemLike = { price: number; unit: string; variants?: VariantLike[]; min_quantity?: number };

function ounces(v: VariantLike): number | null {
  if (/gallon/i.test(v.label) || /gallon/i.test(v.unit || "")) return 128;
  const m = /(\d+)\s*oz/i.exec(`${v.label} ${v.unit || ""}`);
  return m ? Number(m[1]) : null;
}

/** Guests one unit of this variant feeds. */
export function servingsPerUnit(
  item: ItemLike,
  variant: VariantLike | null,
  course?: string
): number {
  const unit = (variant?.unit || item.unit || "").toLowerCase();
  if (unit === "piece") {
    const ppg =
      UNIT_RULES.pieces_per_guest[course || ""] ?? UNIT_RULES.pieces_per_guest.default;
    return 1 / ppg;
  }
  if (variant?.serves && variant.serves > 0) return variant.serves;
  if (unit === "pizza") {
    const p = UNIT_RULES.pizza;
    const slices = p.slices_by_size[variant?.id || ""] ?? p.default_slices;
    return slices / p.slices_per_guest;
  }
  const oz = variant ? ounces(variant) : null;
  if (oz) {
    return oz / (UNIT_RULES.oz_per_guest[course || ""] ?? UNIT_RULES.oz_per_guest.default);
  }
  return 20;
}

/**
 * Pick the variant and unit count that feed `guests` (buffer included) at the lowest price.
 * A preferred variant id wins when the item has it.
 */
export function chooseVariantAndQuantity(
  item: ItemLike,
  guests: number,
  opts: { course?: string; preferVariantId?: string; bufferPercent?: number } = {}
): { variant: VariantLike | null; quantity: number; servings: number } {
  const buffer = opts.bufferPercent ?? PORTION_RULES.buffer_percent;
  const need = Math.max(0, guests) * (1 + buffer / 100);
  const minQ = item.min_quantity || 1;
  const units = (v: VariantLike | null) => {
    const s = servingsPerUnit(item, v, opts.course);
    return { s, q: Math.max(minQ, Math.ceil(need / s - 1e-9) || 1) };
  };
  const variants = item.variants || [];
  if (!variants.length) {
    const { s, q } = units(null);
    return { variant: null, quantity: q, servings: s };
  }
  const preferred = opts.preferVariantId
    ? variants.find((v) => v.id === opts.preferVariantId)
    : undefined;
  if (preferred) {
    const { s, q } = units(preferred);
    return { variant: preferred, quantity: q, servings: s };
  }
  let best: { variant: VariantLike; quantity: number; servings: number; cost: number } | null =
    null;
  for (const v of variants) {
    const { s, q } = units(v);
    const cost = q * v.price;
    if (!best || cost < best.cost - 0.005 || (Math.abs(cost - best.cost) < 0.005 && q < best.quantity)) {
      best = { variant: v, quantity: q, servings: s, cost };
    }
  }
  return { variant: best!.variant, quantity: best!.quantity, servings: best!.servings };
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
