/**
 * What the guest asked the menu to be: cuisines, must-have dishes, courses, exclusions,
 * spice, sizes, and appetite. Diet groups stay in requirement_groups.
 */

export const COURSE_IDS = [
  "appetizer",
  "chaat",
  "main",
  "pasta",
  "dal",
  "soup",
  "starch",
  "bread",
  "salad",
  "dessert",
  "drink",
  "condiment",
  "pizza",
] as const;
export type CourseId = (typeof COURSE_IDS)[number];

export const CUISINE_IDS = [
  "indian",
  "south_indian",
  "indo_chinese",
  "italian",
  "pizza",
  "thai",
] as const;
export type CuisineId = (typeof CUISINE_IDS)[number];

export type CuisineWish = { id: CuisineId; mode: "only" | "include" };

/** A dish reference: catalog id or the name the guest used. Resolved against the catalog at plan time. */
export type DishWish = { ref: string; quantity?: number };

export type MenuWishes = {
  cuisines: CuisineWish[];
  must_have: DishWish[];
  exclude_items: string[];
  courses_only: CourseId[];
  courses_add: CourseId[];
  courses_exclude: CourseId[];
  /** Ingredient or style words matched against dish names and descriptions, e.g. "paneer", "fried". */
  exclude_terms: string[];
  spice_max?: "mild" | "medium" | "hot";
  size_pref?: { pizza?: "10" | "12" | "14"; tray?: "half" | "medium" | "full" };
  appetite?: "light" | "regular" | "hearty";
};

export function emptyMenuWishes(): MenuWishes {
  return {
    cuisines: [],
    must_have: [],
    exclude_items: [],
    courses_only: [],
    courses_add: [],
    courses_exclude: [],
    exclude_terms: [],
  };
}

export function hasWishes(w: MenuWishes | null | undefined): boolean {
  if (!w) return false;
  return Boolean(
    w.cuisines.length ||
      w.must_have.length ||
      w.exclude_items.length ||
      w.courses_only.length ||
      w.courses_add.length ||
      w.courses_exclude.length ||
      w.exclude_terms.length ||
      w.spice_max ||
      w.size_pref?.pizza ||
      w.size_pref?.tray ||
      (w.appetite && w.appetite !== "regular")
  );
}

const isCourse = (v: unknown): v is CourseId =>
  COURSE_IDS.includes(String(v) as CourseId);
const isCuisine = (v: unknown): v is CuisineId =>
  CUISINE_IDS.includes(String(v) as CuisineId);

const COURSE_ALIASES: Record<string, CourseId> = {
  appetizers: "appetizer",
  starter: "appetizer",
  starters: "appetizer",
  snack: "appetizer",
  snacks: "appetizer",
  mains: "main",
  curry: "main",
  entree: "main",
  rice: "starch",
  noodles: "starch",
  breads: "bread",
  roti: "bread",
  desserts: "dessert",
  sweets: "dessert",
  drinks: "drink",
  beverage: "drink",
  beverages: "drink",
  soups: "soup",
  salads: "salad",
  pizzas: "pizza",
  pastas: "pasta",
  chutney: "condiment",
  condiments: "condiment",
};

const CUISINE_ALIASES: Record<string, CuisineId> = {
  "south indian": "south_indian",
  "south-indian": "south_indian",
  "indo chinese": "indo_chinese",
  "indo-chinese": "indo_chinese",
  chinese: "indo_chinese",
  pizzas: "pizza",
  "north indian": "indian",
};

function asCourse(v: unknown): CourseId | null {
  const t = String(v || "").trim().toLowerCase();
  if (isCourse(t)) return t;
  return COURSE_ALIASES[t] ?? null;
}

function asCuisine(v: unknown): CuisineId | null {
  const t = String(v || "").trim().toLowerCase();
  if (isCuisine(t)) return t;
  return CUISINE_ALIASES[t] ?? null;
}

function asList<T>(raw: unknown, map: (v: unknown) => T | null): T[] {
  const arr = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  const out: T[] = [];
  for (const v of arr) {
    const m = map(v);
    if (m != null && !out.some((x) => JSON.stringify(x) === JSON.stringify(m))) out.push(m);
  }
  return out;
}

function asCuisineWish(v: unknown): CuisineWish | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const id = asCuisine(o.id ?? o.cuisine);
    if (!id) return null;
    return { id, mode: o.mode === "only" ? "only" : "include" };
  }
  const id = asCuisine(v);
  return id ? { id, mode: "include" } : null;
}

function asDishWish(v: unknown): DishWish | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ref = String(o.ref ?? o.menu_item_id ?? o.id ?? o.name ?? "").trim();
    if (!ref) return null;
    const q = Number(o.quantity);
    return Number.isFinite(q) && q > 0 ? { ref, quantity: Math.round(q) } : { ref };
  }
  const ref = String(v || "").trim();
  return ref ? { ref } : null;
}

const asText = (v: unknown) => {
  const t = String(v || "").trim().toLowerCase();
  return t || null;
};

/** Validate loose input (model tool args or stored JSON) into MenuWishes. */
export function normalizeWishes(raw: unknown): MenuWishes {
  const w = emptyMenuWishes();
  if (!raw || typeof raw !== "object") return w;
  const o = raw as Record<string, unknown>;
  w.cuisines = dedupeCuisines(asList(o.cuisines, asCuisineWish));
  w.must_have = asList(o.must_have, asDishWish);
  w.exclude_items = asList(o.exclude_items, (v) => asDishWish(v)?.ref ?? null);
  w.courses_only = asList(o.courses_only, asCourse);
  w.courses_add = asList(o.courses_add, asCourse);
  w.courses_exclude = asList(o.courses_exclude, asCourse);
  w.exclude_terms = asList(o.exclude_terms, asText);
  const spice = String(o.spice_max || "").toLowerCase();
  if (spice === "mild" || spice === "medium" || spice === "hot") w.spice_max = spice;
  const size = (o.size_pref && typeof o.size_pref === "object" ? o.size_pref : {}) as Record<
    string,
    unknown
  >;
  const pizza = String(size.pizza || "").replace(/\D/g, "");
  const tray = String(size.tray || "").toLowerCase();
  if (pizza === "10" || pizza === "12" || pizza === "14") w.size_pref = { pizza };
  if (tray === "half" || tray === "medium" || tray === "full") {
    w.size_pref = { ...(w.size_pref || {}), tray };
  }
  const appetite = String(o.appetite || "").toLowerCase();
  if (appetite === "light" || appetite === "regular" || appetite === "hearty") {
    w.appetite = appetite;
  }
  return w;
}

function dedupeCuisines(list: CuisineWish[]): CuisineWish[] {
  const out: CuisineWish[] = [];
  for (const c of list) {
    const i = out.findIndex((x) => x.id === c.id);
    if (i >= 0) out[i] = c;
    else out.push(c);
  }
  return out;
}

const sameRef = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Layer `next` over `base`. Lists union; a later positive wish cancels an earlier negative one
 * (and the reverse), so "no rice" then "add rice back" ends with rice included.
 */
export function mergeWishes(base: MenuWishes, next: MenuWishes): MenuWishes {
  const out: MenuWishes = {
    cuisines: [...base.cuisines],
    must_have: base.must_have.filter((d) => !next.exclude_items.some((x) => sameRef(x, d.ref))),
    exclude_items: base.exclude_items.filter((x) => !next.must_have.some((d) => sameRef(d.ref, x))),
    courses_only: next.courses_only.length ? [...next.courses_only] : [...base.courses_only],
    courses_add: base.courses_add.filter((c) => !next.courses_exclude.includes(c)),
    courses_exclude: base.courses_exclude.filter(
      (c) => !next.courses_add.includes(c) && !next.courses_only.includes(c)
    ),
    exclude_terms: [...base.exclude_terms],
    spice_max: next.spice_max ?? base.spice_max,
    size_pref:
      base.size_pref || next.size_pref ? { ...base.size_pref, ...next.size_pref } : undefined,
    appetite: next.appetite ?? base.appetite,
  };
  for (const c of next.cuisines) {
    const i = out.cuisines.findIndex((x) => x.id === c.id);
    if (i >= 0) out.cuisines[i] = c;
    else out.cuisines.push(c);
  }
  if (next.cuisines.some((c) => c.mode === "only")) {
    const only = next.cuisines.filter((c) => c.mode === "only").map((c) => c.id);
    out.cuisines = out.cuisines.filter((c) => only.includes(c.id) || next.cuisines.some((n) => n.id === c.id));
  }
  for (const d of next.must_have) {
    const i = out.must_have.findIndex((x) => sameRef(x.ref, d.ref));
    if (i >= 0) out.must_have[i] = d;
    else out.must_have.push(d);
  }
  for (const x of next.exclude_items) {
    if (!out.exclude_items.some((y) => sameRef(x, y))) out.exclude_items.push(x);
  }
  for (const c of next.courses_add) if (!out.courses_add.includes(c)) out.courses_add.push(c);
  for (const c of next.courses_exclude) {
    if (!out.courses_exclude.includes(c)) out.courses_exclude.push(c);
  }
  out.courses_only = out.courses_only.filter((c) => !out.courses_exclude.includes(c));
  for (const t of next.exclude_terms) if (!out.exclude_terms.includes(t)) out.exclude_terms.push(t);
  if (!out.size_pref?.pizza && !out.size_pref?.tray) delete out.size_pref;
  if (!out.spice_max) delete out.spice_max;
  if (!out.appetite) delete out.appetite;
  return out;
}

const LIST_FIELDS = [
  "cuisines",
  "must_have",
  "exclude_items",
  "courses_only",
  "courses_add",
  "courses_exclude",
  "exclude_terms",
] as const;
type ListField = (typeof LIST_FIELDS)[number];

/**
 * Apply one memory op on menu_wishes.
 * path "menu_wishes" + update merges a partial object; "menu_wishes.<field>" adds/removes one entry
 * (remove without value clears the field).
 */
export function applyWishOp(
  current: MenuWishes,
  op: string,
  path: string,
  value: unknown
): { wishes: MenuWishes; error?: string } {
  const field = path === "menu_wishes" ? "" : path.slice("menu_wishes.".length);
  if (!field) {
    if (op === "remove") return { wishes: emptyMenuWishes() };
    return { wishes: mergeWishes(current, normalizeWishes(value)) };
  }
  if ((LIST_FIELDS as readonly string[]).includes(field)) {
    const f = field as ListField;
    if (op === "remove") {
      const next = { ...current };
      if (value == null || value === "") {
        next[f] = [] as never;
        return { wishes: next };
      }
      const probe = normalizeWishes({ [f]: [value] })[f] as unknown[];
      const key = (x: unknown) =>
        typeof x === "string"
          ? x.toLowerCase()
          : x && typeof x === "object"
            ? String((x as { id?: string; ref?: string }).id ?? (x as { ref?: string }).ref ?? "").toLowerCase()
            : "";
      const drop = new Set(probe.map(key));
      next[f] = (current[f] as unknown[]).filter((x) => !drop.has(key(x))) as never;
      return { wishes: next };
    }
    const addition = normalizeWishes({ [f]: Array.isArray(value) ? value : [value] });
    if (!(addition[f] as unknown[]).length) return { wishes: current, error: `Invalid ${field} value` };
    return { wishes: mergeWishes(current, addition) };
  }
  if (field === "spice_max" || field === "appetite" || field.startsWith("size_pref")) {
    const next = { ...current, size_pref: current.size_pref ? { ...current.size_pref } : undefined };
    if (op === "remove") {
      if (field === "spice_max") delete next.spice_max;
      else if (field === "appetite") delete next.appetite;
      else if (field === "size_pref") delete next.size_pref;
      else if (next.size_pref) delete next.size_pref[field.slice(10) as "pizza" | "tray"];
      return { wishes: next };
    }
    const partial =
      field.startsWith("size_pref.")
        ? { size_pref: { [field.slice(10)]: value } }
        : { [field]: value };
    const parsed = normalizeWishes(partial);
    if (!hasWishes(parsed)) return { wishes: current, error: `Invalid ${field} value` };
    return { wishes: mergeWishes(current, parsed) };
  }
  return { wishes: current, error: `Unknown menu_wishes field: ${field}` };
}

/** Short text for the prompt so the model sees what was asked. */
export function describeWishes(w: MenuWishes): string {
  const parts: string[] = [];
  if (w.cuisines.length) {
    parts.push(`cuisines=${w.cuisines.map((c) => (c.mode === "only" ? `${c.id}(only)` : c.id)).join(",")}`);
  }
  if (w.must_have.length) {
    parts.push(`must_have=${w.must_have.map((d) => (d.quantity ? `${d.ref}x${d.quantity}` : d.ref)).join("|")}`);
  }
  if (w.exclude_items.length) parts.push(`exclude_items=${w.exclude_items.join("|")}`);
  if (w.courses_only.length) parts.push(`courses_only=${w.courses_only.join(",")}`);
  if (w.courses_add.length) parts.push(`courses_add=${w.courses_add.join(",")}`);
  if (w.courses_exclude.length) parts.push(`courses_exclude=${w.courses_exclude.join(",")}`);
  if (w.exclude_terms.length) parts.push(`exclude_terms=${w.exclude_terms.join(",")}`);
  if (w.spice_max) parts.push(`spice_max=${w.spice_max}`);
  if (w.size_pref?.pizza) parts.push(`pizza_size=${w.size_pref.pizza}in`);
  if (w.size_pref?.tray) parts.push(`tray_size=${w.size_pref.tray}`);
  if (w.appetite && w.appetite !== "regular") parts.push(`appetite=${w.appetite}`);
  return parts.join("; ");
}
