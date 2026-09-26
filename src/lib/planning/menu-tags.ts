import type { DietTag, MenuItem, MenuVariant } from "@/lib/types";

export type GlutenStatus = "unknown" | "contains_gluten" | "may_contain" | "gluten_free_option";
export type SpiceLevel = "mild" | "medium" | "hot" | "unknown";
export type BestServed = "hot" | "room" | "cold" | "either";

/** Planning tags derived from seed + optional overrides on MenuItem. */
export type PlanningTags = {
  jain_ok: boolean;
  vegan: boolean;
  no_onion_garlic_ok: boolean;
  allergens: string[];
  gluten_status: GlutenStatus;
  spice_level: SpiceLevel;
  kid_friendly: boolean;
  max_hold_minutes: number | null;
  holds_well: boolean;
  best_served: BestServed;
};

export type PlanningMenuRow = {
  id: string;
  name: string;
  category_id: string;
  price: number;
  unit: string;
  serves: number | null;
  variant_id?: string;
  diet_tags: DietTag[];
  is_available: boolean;
  tags: PlanningTags;
  variants: { id: string; label: string; price: number; unit?: string; serves?: number }[];
};

const MILD_NAME_HINT =
  /idli|dahi|khichri|pulao|rice|roti|cheese pizza|margherita|srikhand|gulab|ras malai|salad|paneer tikka(?! masala)/i;
const KID_HINT =
  /pizza|cheese|idli|dahi|samosa|gulab|halwa|roti|pulao|khichri|butter corn/i;
const HOT_HINT = /chili|chilli|manchurian|manchow|pad|thai green/i;

function hasDiet(item: MenuItem, tag: DietTag) {
  return item.diet_tags?.includes(tag) ?? false;
}

export function derivePlanningTags(item: MenuItem): PlanningTags {
  const name = item.name || "";
  const notes = `${item.notes || ""} ${item.description || ""}`.toLowerCase();
  const allergenSet = new Set(
    (item.allergens || []).map((a) => a.toLowerCase().trim()).filter(Boolean)
  );
  // Peanut oil mentioned on alu gobi — surface as known allergen when in copy
  if (/peanut/.test(notes)) allergenSet.add("peanut");
  if (/cashew|kaju/.test(notes)) allergenSet.add("cashew");
  if (/almond|badam/.test(notes)) allergenSet.add("almond");
  if (/walnut/.test(notes)) allergenSet.add("walnut");
  if (/tree nut|nuts?\b/.test(notes) && !allergenSet.size) {
    /* leave empty — do not invent tree-nut when ambiguous */
  }

  let spice: SpiceLevel = item.spice_level || "unknown";
  if (spice === "unknown") {
    if (HOT_HINT.test(name)) spice = "hot";
    else if (MILD_NAME_HINT.test(name)) spice = "mild";
    else spice = "medium";
  }

  return {
    jain_ok: item.jain_ok ?? hasDiet(item, "jain"),
    vegan: item.vegan_ok ?? hasDiet(item, "vegan"),
    // Kitchen-wide: no onion/garlic/mushrooms in any path
    no_onion_garlic_ok: item.no_onion_garlic_ok ?? true,
    allergens: Array.from(allergenSet),
    gluten_status: item.gluten_status || "unknown",
    spice_level: spice,
    kid_friendly: item.kid_friendly ?? KID_HINT.test(name),
    max_hold_minutes: item.max_hold_minutes ?? null,
    holds_well: item.holds_well ?? true,
    best_served: item.best_served || "hot",
  };
}

export function pickDefaultVariant(item: MenuItem): MenuVariant | null {
  if (!item.variants?.length) return null;
  // Prefer medium, else first with serves, else first
  return (
    item.variants.find((v) => v.id === "medium") ||
    item.variants.find((v) => v.serves != null) ||
    item.variants[0]
  );
}

export function toPlanningRow(
  item: MenuItem,
  variant?: MenuVariant | null
): PlanningMenuRow {
  const v = variant === undefined ? pickDefaultVariant(item) : variant;
  return {
    id: item.id,
    name: v ? `${item.name} (${v.label})` : item.name,
    category_id: item.category_id,
    price: v?.price ?? item.price,
    unit: v?.unit || item.unit,
    serves: v?.serves ?? null,
    variant_id: v?.id,
    diet_tags: item.diet_tags,
    is_available: item.is_available,
    tags: derivePlanningTags(item),
    variants: (item.variants || []).map((x) => ({
      id: x.id,
      label: x.label,
      price: x.price,
      unit: x.unit,
      serves: x.serves,
    })),
  };
}

export type MenuFilter = {
  diet?: string;
  jain_ok?: boolean;
  vegan?: boolean;
  kid_friendly?: boolean;
  spice_max?: SpiceLevel;
  /** Exclude items that list this allergen (case-insensitive). Unknown allergens → exclude. */
  exclude_allergen?: string;
  available_only?: boolean;
  category_id?: string;
  query?: string;
  limit?: number;
};

function spiceRank(s: SpiceLevel): number {
  if (s === "mild") return 1;
  if (s === "medium") return 2;
  if (s === "hot") return 3;
  return 2;
}

export function filterMenuItems(
  items: MenuItem[],
  filters: MenuFilter = {}
): PlanningMenuRow[] {
  const limit = filters.limit ?? 40;
  const q = (filters.query || "").toLowerCase().trim();
  const allergen = (filters.exclude_allergen || "").toLowerCase().trim();
  const diet = (filters.diet || "").toLowerCase().trim();

  const rows: PlanningMenuRow[] = [];
  for (const item of items) {
    if (filters.available_only !== false && !item.is_available) continue;
    if (filters.category_id && item.category_id !== filters.category_id) continue;
    if (q && !`${item.name} ${item.description}`.toLowerCase().includes(q)) {
      continue;
    }
    if (diet && diet !== "pure_vegetarian" && diet !== "italian") {
      if (!item.diet_tags.includes(diet as DietTag)) continue;
    }
    const tags = derivePlanningTags(item);
    if (filters.jain_ok && !tags.jain_ok) continue;
    if (filters.vegan && !tags.vegan) continue;
    if (filters.kid_friendly && !tags.kid_friendly) continue;
    if (filters.spice_max && spiceRank(tags.spice_level) > spiceRank(filters.spice_max)) {
      continue;
    }
    if (allergen) {
      // Empty allergens = unknown → not allowed for allergy groups
      if (!tags.allergens.length) continue;
      if (tags.allergens.some((a) => a.includes(allergen) || allergen.includes(a))) {
        continue;
      }
    }
    rows.push(toPlanningRow(item));
    if (rows.length >= limit) break;
  }
  return rows;
}
