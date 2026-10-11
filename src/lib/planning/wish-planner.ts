/**
 * Builds a menu from the guest's wishes: cuisines, must-have dishes, courses, exclusions,
 * spice, sizes, appetite, and every diet group. Reports what it honored and what it could not.
 */
import type { MenuItem, MenuVariant } from "@/lib/types";
import type { GuestEventMemory, RequirementKind } from "@/lib/planning/guest-memory";
import type {
  BuildPlanResult,
  PlanCoverage,
  PlanLine,
  PlanTimeline,
} from "@/lib/planning/engine";
import {
  adultEquivalent,
  chooseVariantAndQuantity,
  effectiveHeadcount,
  PORTION_RULES,
  subtractMinutes,
  UNIT_RULES,
  type MealKind,
} from "@/lib/planning/portion-rules";
import { derivePlanningTags } from "@/lib/planning/menu-tags";
import { fitPlanToBudget, classifyLineRole } from "@/lib/planning/budget-trim";
import { pickBestCombo, type FamousCombination } from "@/lib/planning/famous-combinations";
import {
  courseOf,
  cuisineFits,
  cuisineOf,
  resolveCourses,
  type CourseSlot,
} from "@/lib/planning/menu-templates";
import type { CourseId, CuisineId, MenuWishes } from "@/lib/planning/menu-wishes";
import { buildItemAliases } from "@/lib/planning/wish-lexicon";

const MAX_PLAN_LINES = 12;

const DIET_KINDS = ["jain", "vegan", "swaminarayan", "pushtimarg"] as const;
type DietKind = (typeof DIET_KINDS)[number];

const DIET_LABEL: Record<DietKind, string> = {
  jain: "Jain",
  vegan: "vegan",
  swaminarayan: "Swaminarayan",
  pushtimarg: "Pushtimarg",
};

const CUISINE_LABEL: Record<CuisineId, string> = {
  indian: "Indian",
  south_indian: "South Indian",
  indo_chinese: "Indo-Chinese",
  italian: "Italian",
  pizza: "pizza",
  thai: "Thai",
};

const COURSE_LABEL: Record<CourseId, string> = {
  appetizer: "appetizer",
  chaat: "chaat",
  main: "main dish",
  pasta: "pasta",
  dal: "dal",
  soup: "soup",
  starch: "rice or noodles",
  bread: "bread",
  salad: "salad",
  dessert: "dessert",
  drink: "drink",
  condiment: "chutney or side",
  pizza: "pizza",
};

/** Words a guest may rule out, matched against dish name + description. */
const TERM_PATTERNS: Record<string, RegExp> = {
  fried: /fried|pakora|pakoda|bhaji|samosa|vada|poori|puri|bhatura|kachori|chips|fritter|crispy|cutlet|tikki|manchurian|spring roll|wanton/i,
  potato: /potato|aloo|alu\b|batata/i,
  cheese: /cheese|mozzarella|parmesan|ricotta/i,
  dairy: /paneer|cheese|cream|malai|ghee|butter|dahi|yogurt|curd|milk|ricotta|mozzarella|raita|lassi|kheer/i,
  gluten: /roti|naan|bread|poori|puri|bhatura|pasta|pizza|noodle|chow ?mein|paratha|kulcha|focaccia|pav\b|samosa/i,
  nuts: /cashew|kaju|almond|badam|peanut|pista|walnut|nut\b/i,
  eggplant: /eggplant|baingan|brinjal/i,
  chickpea: /chickpea|chole|chana|garbanzo/i,
  cream: /cream|malai/i,
};
const TERM_ALIASES: Record<string, string> = {
  wheat: "gluten",
  "gluten free": "gluten",
  "deep fried": "fried",
  aloo: "potato",
  potatoes: "potato",
  nut: "nuts",
  peanut: "nuts",
  cashew: "nuts",
  milk: "dairy",
  "dairy free": "dairy",
};

function termMatches(item: MenuItem, rawTerm: string): boolean {
  const term = TERM_ALIASES[rawTerm] || rawTerm;
  const text = `${item.name} ${item.description || ""}`;
  if (term === "gluten" && item.gluten_status === "contains_gluten") return true;
  if (term === "nuts" && derivePlanningTags(item).allergens.some((a) => /nut|cashew|almond/.test(a))) {
    return true;
  }
  const re = TERM_PATTERNS[term];
  if (re) return re.test(text);
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text);
}

function dietOk(item: MenuItem, kind: DietKind): boolean {
  const tags = derivePlanningTags(item);
  if (kind === "jain") return tags.jain_ok;
  if (kind === "vegan") return tags.vegan;
  return item.diet_tags.includes(kind);
}

const SPICE_RANK = { mild: 1, medium: 2, hot: 3, unknown: 2 } as const;

function segCount(memory: GuestEventMemory, key: string): number {
  return (
    memory.headcount.segments.find((s) => s.key === key)?.count ??
    memory.requirement_groups.find((g) => g.kind === (key as RequirementKind))?.count ??
    0
  );
}

/** Find a catalog dish for a guest reference (id, exact name, or a name the guest used). */
export function resolveDishRef(
  ref: string,
  catalog: MenuItem[],
  aliases = buildItemAliases(catalog)
): MenuItem | null {
  const r = ref.trim().toLowerCase();
  if (!r) return null;
  const byId = catalog.find((i) => i.id.toLowerCase() === r);
  if (byId) return byId;
  const byName = catalog.find((i) => i.name.toLowerCase() === r);
  if (byName) return byName;
  const norm = r.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const singular = norm
    .split(" ")
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  const aliasId = aliases.get(singular) || aliases.get(norm);
  if (aliasId) return catalog.find((i) => i.id === aliasId) || null;
  const contains = catalog.filter((i) => i.name.toLowerCase().includes(norm));
  return contains.length === 1 ? contains[0] : null;
}

type Pick = {
  item: MenuItem;
  slot: CourseSlot;
  mustHave?: boolean;
  quantity?: number;
};

function variantLabel(v: MenuVariant | null): string {
  return v ? v.label : "";
}

function lineFor(
  item: MenuItem,
  guests: number,
  coverageFor: string,
  course: CourseId | null,
  wishes: MenuWishes,
  fixedQuantity?: number
): PlanLine {
  const preferVariantId =
    item.category_id === "cat-pizzas"
      ? wishes.size_pref?.pizza || UNIT_RULES.pizza.default_size
      : wishes.size_pref?.tray;
  const choice = chooseVariantAndQuantity(item, guests, {
    course: course || undefined,
    preferVariantId,
  });
  const quantity = fixedQuantity ? Math.max(fixedQuantity, item.min_quantity || 1) : choice.quantity;
  const price = choice.variant?.price ?? item.price;
  return {
    menu_item_id: item.id,
    variant_id: choice.variant?.id,
    name: choice.variant ? `${item.name} (${variantLabel(choice.variant)})` : item.name,
    quantity,
    unit: choice.variant?.unit || item.unit,
    price,
    line_total: Math.round(quantity * price * 100) / 100,
    serves: Math.round(choice.servings * 100) / 100,
    coverage_for: coverageFor,
  };
}

export function quantityPhrase(line: PlanLine): string {
  const unit = (line.unit || "").toLowerCase();
  const feeds = Math.round((line.serves || 0) * line.quantity);
  if (unit === "pizza") {
    const size = line.variant_id || UNIT_RULES.pizza.default_size;
    const slices =
      (UNIT_RULES.pizza.slices_by_size[size] ?? UNIT_RULES.pizza.default_slices) * line.quantity;
    const n = line.quantity;
    return `${n} ${size}-inch pizza${n === 1 ? "" : "s"}, ${slices} slices, enough for about ${feeds} guests at ${UNIT_RULES.pizza.slices_per_guest} slices each`;
  }
  if (unit === "piece") {
    return `${line.quantity} pieces, enough for about ${feeds} guests`;
  }
  if (/tray/.test(unit)) {
    const label = line.name.match(/\(([^)]+)\)\s*$/)?.[1]?.toLowerCase() || unit;
    const size = /tray/.test(label) ? label : `${label} tray`;
    const article = line.quantity === 1 ? (/^[aeiou]/i.test(size) ? "An" : "A") : `${line.quantity}`;
    return `${article} ${size}${line.quantity === 1 ? "" : "s"} cover${line.quantity === 1 ? "s" : ""} about ${feeds} guests`;
  }
  return `${line.quantity} × ${line.unit}, enough for about ${feeds} guests`;
}

const COURSE_REASON: Record<CourseId, string> = {
  appetizer: "The crisp start",
  chaat: "The chaat round",
  main: "A main dish",
  pasta: "The pasta",
  dal: "The lighter curry beside the main",
  soup: "A warm soup",
  starch: "The rice or noodles",
  bread: "The bread that completes the plate",
  salad: "A fresh salad",
  dessert: "A sweet finish",
  drink: "Something to drink",
  condiment: "A side to go with it",
  pizza: "One of the pizza styles",
};

function reasonFor(
  line: PlanLine,
  pick: Pick | undefined,
  combo: FamousCombination | null
): string {
  const cov = line.coverage_for || "";
  let lead: string;
  const diet = DIET_KINDS.find((k) => cov.includes(k));
  if (diet) lead = `For the ${DIET_LABEL[diet]} guests`;
  else if (cov.includes("kids")) lead = "A mild dish for the children";
  else if (pick?.mustHave) lead = "You asked for this";
  else if (combo && combo.item_ids.includes(line.menu_item_id)) lead = combo.why.replace(/\.$/, "");
  else lead = pick ? COURSE_REASON[pick.slot.course] : "Part of this menu";
  return `${lead}. ${quantityPhrase(line)}.`;
}

/**
 * Diet, allergy, spice, and exclusion rules for one party. Whole-party diets (80%+) filter every
 * dish; smaller diet groups get dedicated dishes.
 */
export function menuRules(
  memory: GuestEventMemory,
  catalog: MenuItem[],
  wishes: MenuWishes,
  total: number
) {
  const aliases = buildItemAliases(catalog);
  const declined = new Set(memory.declined_suggestions.map((d) => d.toLowerCase()));
  const groupDiets: { kind: DietKind; count: number }[] = [];
  const wholeDiets: DietKind[] = [];
  for (const g of memory.requirement_groups) {
    if (!(DIET_KINDS as readonly string[]).includes(g.kind) || g.count <= 0) continue;
    const kind = g.kind as DietKind;
    if (g.count >= total * 0.8) wholeDiets.push(kind);
    else groupDiets.push({ kind, count: g.count });
  }
  const allergens = memory.requirement_groups
    .filter((g) => g.kind === "allergy" && g.allergen)
    .map((g) => g.allergen!.toLowerCase());
  const mildGroup = memory.requirement_groups.some(
    (g) => g.kind === "spice_mild" && g.count >= total * 0.8
  );
  const spiceCap: "mild" | "medium" | null = mildGroup
    ? "mild"
    : wishes.spice_max && wishes.spice_max !== "hot"
      ? wishes.spice_max
      : null;
  const excludedItems = wishes.exclude_items
    .map((ref) => resolveDishRef(ref, catalog, aliases))
    .filter((i): i is MenuItem => Boolean(i));
  const excludedIds = new Set(excludedItems.map((i) => i.id));

  /** Why a dish cannot be on this menu, or null when it can. */
  const blockedBy = (item: MenuItem): string | null => {
    if (item.is_available === false) return "It is not available right now";
    if (declined.has(item.id.toLowerCase()) || declined.has(item.name.toLowerCase())) {
      return "You passed on it earlier";
    }
    if (excludedIds.has(item.id)) return "You asked to leave it out";
    const term = wishes.exclude_terms.find((t) => termMatches(item, t));
    if (term) return `It has ${term}`;
    for (const d of wholeDiets) if (!dietOk(item, d)) return `It is not ${DIET_LABEL[d]}`;
    const tags = derivePlanningTags(item);
    if (
      allergens.some(
        (a) => tags.allergens.some((x) => x.includes(a) || a.includes(x)) || termMatches(item, a)
      )
    ) {
      return "It may contain an allergen in your group";
    }
    if (spiceCap && SPICE_RANK[tags.spice_level] > SPICE_RANK[spiceCap]) {
      return "It is spicier than you asked";
    }
    return null;
  };
  return { aliases, declined, groupDiets, wholeDiets, allergens, spiceCap, excludedItems, blockedBy };
}

export type WishPlanInput = {
  memory: GuestEventMemory;
  catalog: MenuItem[];
  wishes: MenuWishes;
  total: number;
  prefer_item_ids?: string[];
  /** Exact number of dishes the guest asked for. */
  dish_count?: number | null;
};

export function buildWishPlan(input: WishPlanInput): BuildPlanResult {
  const { memory, catalog, wishes, total } = input;
  const warnings: string[] = [...memory.conflicts];
  const notes: string[] = [];
  const coverage: PlanCoverage[] = [];
  const honored: string[] = [];
  const unmet: { wish: string; reason: string }[] = [];

  const kids = segCount(memory, "kids");
  const toddlers = segCount(memory, "toddlers");
  const adults = segCount(memory, "adults") || Math.max(0, total - kids - toddlers);
  const meal = (memory.event.meal || "lunch") as MealKind;
  const appetite = UNIT_RULES.appetite[wishes.appetite || "regular"] ?? 1;
  const need = effectiveHeadcount(adultEquivalent({ adults, kids, toddlers, total }), meal) * appetite;
  if (wishes.appetite && wishes.appetite !== "regular") {
    honored.push(wishes.appetite === "light" ? "Lighter portions" : "Bigger portions for hearty eaters");
  }

  const rules = menuRules(memory, catalog, wishes, total);
  const { aliases, declined, groupDiets, wholeDiets, allergens, spiceCap, blockedBy } = rules;
  for (const item of rules.excludedItems) honored.push(`Leaves out ${item.name}`);
  for (const t of wishes.exclude_terms) honored.push(`Nothing with ${t}`);
  for (const c of wishes.courses_exclude) honored.push(`No ${COURSE_LABEL[c]}`);
  if (spiceCap) honored.push(spiceCap === "mild" ? "Mild spice" : "Medium spice at most");
  const pool = catalog.filter((i) => !blockedBy(i));

  let slots = resolveCourses({ meal, wishes, guests: total });
  const picks: Pick[] = [];
  const used = new Set<string>();

  // Must-have dishes first.
  for (const wish of wishes.must_have) {
    const item = resolveDishRef(wish.ref, catalog, aliases);
    if (!item) {
      unmet.push({ wish: wish.ref, reason: "We do not have that dish on our menu" });
      continue;
    }
    const why = blockedBy(item);
    if (why) {
      unmet.push({ wish: item.name, reason: why });
      continue;
    }
    if (used.has(item.id)) continue;
    const course = courseOf(item) || "main";
    let slot = slots.find((s) => s.course === course && cuisineFits(item, s.cuisine, false));
    slot ||= slots.find((s) => s.course === course);
    if (!slot) {
      slot = { course, cuisine: cuisineOf(item), dishes: 0, coverage: 0.7, strict: false, requested: true };
      slots.push(slot);
    }
    if (picks.filter((p) => p.slot === slot).length >= slot.dishes) slot.dishes += 1;
    picks.push({ item, slot, mustHave: true, quantity: wish.quantity });
    used.add(item.id);
    honored.push(`Includes ${item.name}`);
  }

  // Fill each course: guest favorites, then famous pairings, then the catalog order.
  const prefer = new Set(input.prefer_item_ids || []);
  const hints = [
    ...wishes.cuisines.map((c) => c.id),
    ...wholeDiets,
    meal,
    ...(memory.event.occasion ? [memory.event.occasion.toLowerCase()] : []),
  ];
  const catalogIds = new Set(catalog.map((i) => i.id));
  for (const slot of slots) {
    const have = picks.filter((p) => p.slot === slot).length;
    if (have >= slot.dishes) continue;
    const combo = pickBestCombo({ catalogIds, item_ids: picks.map((p) => p.item.id), hints, declined });
    const comboIds = new Set(combo?.item_ids || []);
    const rank = (i: MenuItem) =>
      (prefer.has(i.id) ? 0 : 4) +
      (comboIds.has(i.id) ? 0 : 2) +
      (cuisineOf(i) === slot.cuisine ? 0 : 1);
    const inCourse = pool.filter((i) => !used.has(i.id) && courseOf(i) === slot.course);
    let candidates = inCourse.filter((i) => cuisineFits(i, slot.cuisine, slot.strict));
    const anyCuisine = slot.requested && !slot.strict && !wishes.cuisines.length;
    if (anyCuisine || (!candidates.length && !slot.strict && slot.requested)) {
      candidates = [...candidates, ...inCourse.filter((i) => !candidates.includes(i))];
    }
    candidates.sort((a, b) => rank(a) - rank(b));
    const take = candidates.slice(0, slot.dishes - have);
    for (const item of take) {
      picks.push({ item, slot });
      used.add(item.id);
    }
    if (!take.length && have === 0 && (slot.requested || slot.strict)) {
      const dietWords = wholeDiets.map((d) => DIET_LABEL[d]).join(" ");
      unmet.push({
        wish: `${slot.strict || slot.cuisine !== "indian" ? `${CUISINE_LABEL[slot.cuisine]} ` : ""}${COURSE_LABEL[slot.course]}`,
        reason: `No ${dietWords ? `${dietWords} ` : ""}${COURSE_LABEL[slot.course]} on our menu fits what you asked`,
      });
    }
  }
  slots = slots.filter((s) => picks.some((p) => p.slot === s));

  // Cuisine and course wishes that made it onto the menu.
  for (const c of wishes.cuisines) {
    const n = picks.filter((p) => cuisineFits(p.item, c.id, true)).length;
    if (n) honored.push(c.mode === "only" ? `Only ${CUISINE_LABEL[c.id]}` : `${CUISINE_LABEL[c.id]} dishes`);
    else if (!unmet.some((u) => u.wish.startsWith(CUISINE_LABEL[c.id]))) {
      unmet.push({ wish: CUISINE_LABEL[c.id], reason: "No dish in that style fits the other wishes" });
    }
  }
  for (const c of [...wishes.courses_only, ...wishes.courses_add]) {
    if (picks.some((p) => p.slot.course === c)) honored.push(`${COURSE_LABEL[c]} included`);
  }

  // Dish cap: the guest's count, else MAX_PLAN_LINES. Drop optional courses first.
  const dedicatedSlots = groupDiets.length + (kids + toddlers > 0 ? 1 : 0);
  const cap = Math.max(1, (input.dish_count ?? MAX_PLAN_LINES) - (input.dish_count ? 0 : dedicatedSlots));
  const DROP_ORDER: CourseId[] = ["condiment", "soup", "salad", "drink", "dessert", "chaat", "dal", "appetizer", "bread", "pasta", "starch", "main", "pizza"];
  const lastIndex = (test: (p: Pick) => boolean) => {
    for (let i = picks.length - 1; i >= 0; i--) if (test(picks[i])) return i;
    return -1;
  };
  while (picks.length > cap) {
    let idx = -1;
    for (const course of DROP_ORDER) {
      idx = lastIndex((p) => !p.mustHave && !p.slot.requested && p.slot.course === course);
      if (idx >= 0) break;
    }
    if (idx < 0) idx = lastIndex((p) => !p.mustHave);
    if (idx < 0) break;
    picks.splice(idx, 1);
  }

  // Quantities: each course feeds its share of the guests, split across its dishes.
  const dedicatedGuests = groupDiets.reduce((s, g) => s + g.count, 0);
  const generalGuests = Math.max(0, need - dedicatedGuests * 0.5);
  const lines: PlanLine[] = [];
  const pickById = new Map<string, Pick>();
  /** Pizza courses: size the whole course once, then spread pizzas across styles (avoids rounding up per style). */
  const pizzaShare = new Map<string, number>();
  for (const slot of slots) {
    const inSlot = picks.filter((x) => x.slot === slot && !x.quantity);
    if (slot.course !== "pizza" || inSlot.length < 2) continue;
    const whole = lineFor(inSlot[0].item, generalGuests * slot.coverage, "general", "pizza", wishes);
    const total = Math.max(inSlot.length, whole.quantity);
    inSlot.forEach((p, i) => {
      pizzaShare.set(p.item.id, Math.floor(total / inSlot.length) + (i < total % inSlot.length ? 1 : 0));
    });
  }
  for (const p of picks) {
    const inSlot = picks.filter((x) => x.slot === p.slot).length || 1;
    const guests = (generalGuests * p.slot.coverage) / inSlot;
    const fixed = p.quantity ?? pizzaShare.get(p.item.id);
    lines.push(lineFor(p.item, guests, "general", p.slot.course, wishes, fixed));
    pickById.set(p.item.id, p);
  }

  // Part of the party has a diet: dedicated dishes from the menu's main courses.
  const MAIN_COURSES: CourseId[] = ["main", "pizza", "pasta", "starch", "dal"];
  const planCourses = new Set(picks.map((p) => p.slot.course));
  for (const g of groupDiets) {
    const label = DIET_LABEL[g.kind];
    const onMenu = picks.filter((p) => dietOk(p.item, g.kind) && MAIN_COURSES.includes(p.slot.course));
    const candidates = catalog
      .filter((i) => {
        if (blockedBy(i) && blockedBy(i) !== `It is not ${label}`) return false;
        const c = courseOf(i);
        return dietOk(i, g.kind) && c && MAIN_COURSES.includes(c) && !used.has(i.id);
      })
      .sort((a, b) => {
        const score = (i: MenuItem) =>
          (planCourses.has(courseOf(i)!) ? 0 : 2) +
          (wishes.cuisines.some((c) => cuisineFits(i, c.id, true)) ? 0 : 1);
        return score(a) - score(b);
      });
    const chosen = candidates.slice(0, Math.max(0, 2 - onMenu.length));
    for (const item of chosen) {
      const line = lineFor(item, g.count / Math.max(1, chosen.length), g.kind, courseOf(item), wishes);
      if (/tray/.test(line.unit)) line.quantity = Math.max(PORTION_RULES.min_dedicated_trays, line.quantity);
      line.line_total = Math.round(line.quantity * line.price * 100) / 100;
      lines.push(line);
      used.add(item.id);
    }
    const covered = [...onMenu.map((p) => p.item.name), ...chosen.map((i) => i.name)];
    coverage.push({
      group: g.kind,
      guests: g.count,
      covered_by: covered,
      ok: covered.length > 0,
      note: covered.length ? undefined : `No ${label} dish fits the other wishes.`,
    });
    if (covered.length) honored.push(`${label} dishes for ${g.count} guests`);
    else {
      warnings.push(`No ${label} dish fits the other wishes.`);
      unmet.push({ wish: `${label} food for ${g.count} guests`, reason: `No ${label} dish fits the other wishes` });
    }
  }
  for (const d of wholeDiets) honored.push(`Every dish is ${DIET_LABEL[d]}`);

  // Children: reuse a mild, kid-friendly dish already on the menu, else add one.
  const young = kids + toddlers;
  if (young > 0) {
    const kidOk = (i: MenuItem) => {
      const t = derivePlanningTags(i);
      return t.kid_friendly && t.spice_level === "mild";
    };
    const onMenu = picks.filter((p) => kidOk(p.item)).map((p) => p.item.name);
    let added: MenuItem | undefined;
    if (!onMenu.length) {
      added = pool
        .filter((i) => kidOk(i) && !used.has(i.id))
        .sort((a, b) => Number(!wishes.cuisines.some((c) => cuisineFits(b, c.id, false))) - Number(!wishes.cuisines.some((c) => cuisineFits(a, c.id, false))))[0];
      if (added) {
        lines.push(lineFor(added, young, "kids", courseOf(added), wishes));
        used.add(added.id);
      }
    }
    const covered = added ? [added.name] : onMenu;
    coverage.push({ group: "kids", guests: young, covered_by: covered, ok: covered.length > 0 });
  }

  if (allergens.length) {
    notes.push(
      `Left out dishes that list ${allergens.join(", ")}. Kitchen allergen tags are incomplete, so the kitchen must confirm before the order is final.`
    );
  }

  let collapsed = collapseLines(lines);
  const budget = memory.event.budget != null && memory.event.budget > 0 ? Number(memory.event.budget) : null;
  if (budget != null) {
    const hasMeal = collapsed.some((l) => {
      const r = classifyLineRole(l, catalog);
      return r === "main" || r === "starch";
    });
    if (hasMeal) {
      const fit = fitPlanToBudget({ lines: collapsed, budget, neededServes: need, catalog });
      collapsed = fit.lines as PlanLine[];
      warnings.push(...fit.warnings);
      notes.push(...fit.notes, ...fit.actions.slice(0, 4));
    } else {
      const cost = collapsed.reduce((s, l) => s + l.line_total, 0);
      if (cost > budget) {
        warnings.push(`This menu comes to about $${Math.round(cost)}, above the $${budget} budget.`);
      }
    }
  }

  const shownLimit = Math.min(MAX_PLAN_LINES + dedicatedSlots, input.dish_count ?? Number.MAX_SAFE_INTEGER);
  const combo = pickBestCombo({ catalogIds, item_ids: picks.map((p) => p.item.id), hints, declined });
  const shown = collapsed.slice(0, shownLimit).map((l) => ({
    ...l,
    reason: reasonFor(l, pickById.get(l.menu_item_id), combo),
  }));
  if (input.dish_count && shown.length < input.dish_count) {
    notes.push(`Guest asked for ${input.dish_count} dishes; the menu could support ${shown.length} with these wishes.`);
  }

  const money = Math.round(shown.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  const perHead = total > 0 ? Math.round((money / total) * 100) / 100 : null;

  const timeline: PlanTimeline[] = [];
  if (memory.timeline.length) {
    for (const slot of memory.timeline) {
      timeline.push({ label: slot.label, time: slot.time, items: shown.slice(0, 4).map((l) => l.name) });
    }
  } else {
    const mealTime = memory.event.meal_time;
    const delivery = mealTime ? subtractMinutes(mealTime, PORTION_RULES.delivery_lead_minutes) : undefined;
    timeline.push({ label: "Single delivery", time: delivery, items: shown.map((l) => l.name) });
    if (!mealTime) notes.push("Ask meal time so we can schedule delivery ~20 minutes before.");
  }

  coverage.unshift({
    group: "general",
    guests: Math.round(generalGuests),
    covered_by: picks.map((p) => p.item.name),
    ok: picks.length > 0,
  });
  if (!picks.length) warnings.push("Could not find dishes that fit these wishes.");
  if (honored.length) notes.unshift(`Honored: ${dedupe(honored).join("; ")}.`);
  if (unmet.length) {
    notes.unshift(`Could not do: ${unmet.map((u) => `${u.wish} (${u.reason})`).join("; ")}. Tell the guest plainly.`);
  }

  const primary = wishes.cuisines.length === 1 ? wishes.cuisines[0].id : null;
  const dietTitle = wholeDiets.length ? `${wholeDiets.map((d) => DIET_LABEL[d]).join(" ")} ` : "";
  const styleTitle = primary === "pizza" ? "pizza party" : primary ? `${CUISINE_LABEL[primary]} menu` : "menu";
  return {
    ok: picks.length > 0 && !warnings.some((w) => w.includes("Cannot") || w.includes("Missing")),
    mode: "build",
    items: shown,
    per_head: perHead,
    total: money,
    coverage,
    timeline,
    warnings,
    notes,
    lines: shown.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      line_total: i.line_total,
      reason: i.reason || "",
    })),
    lines_title: `${dietTitle}${styleTitle} for ${total} guests`.replace(/^./, (c) => c.toUpperCase()),
    lines_total: money,
    summary:
      `Built plan from guest wishes: ${shown.length} line(s), $${Math.round(money)} total` +
      (perHead != null ? ` (~$${perHead}/guest).` : ".") +
      (budget != null ? ` Budget $${budget}.` : ""),
    honored: dedupe(honored),
    unmet,
  };
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}

function collapseLines(lines: PlanLine[]): PlanLine[] {
  const map = new Map<string, PlanLine>();
  for (const l of lines) {
    const key = `${l.menu_item_id}|${l.variant_id || ""}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...l });
      continue;
    }
    prev.quantity += l.quantity;
    prev.line_total = Math.round(prev.quantity * prev.price * 100) / 100;
    if (l.coverage_for && prev.coverage_for !== l.coverage_for) {
      prev.coverage_for = `${prev.coverage_for}+${l.coverage_for}`;
    }
  }
  return Array.from(map.values());
}
