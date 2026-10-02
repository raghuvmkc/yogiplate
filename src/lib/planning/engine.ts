import type { MenuItem } from "@/lib/types";
import type { GuestEventMemory } from "@/lib/planning/guest-memory";
import {
  adultEquivalent,
  effectiveHeadcount,
  PORTION_RULES,
  subtractMinutes,
  traysForServes,
  type MealKind,
} from "@/lib/planning/portion-rules";
import {
  derivePlanningTags,
  filterMenuItems,
  pickDefaultVariant,
  type PlanningMenuRow,
} from "@/lib/planning/menu-tags";
import { fitPlanToBudget } from "@/lib/planning/budget-trim";
import {
  categoryToRole,
  pickBestCombo,
  type ComboRole,
} from "@/lib/planning/famous-combinations";

export type PlanLine = {
  menu_item_id: string;
  variant_id?: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  line_total: number;
  serves?: number | null;
  coverage_for?: string;
};

export type PlanCoverage = {
  group: string;
  guests: number;
  covered_by: string[];
  ok: boolean;
  note?: string;
};

export type PlanTimeline = {
  label: string;
  time?: string;
  items: string[];
};

export type BuildPlanResult = {
  ok: boolean;
  mode: "build" | "validate";
  items: PlanLine[];
  per_head: number | null;
  total: number;
  coverage: PlanCoverage[];
  timeline: PlanTimeline[];
  warnings: string[];
  notes: string[];
  /** Ready for ChatRichMessage numbered lines */
  lines: {
    name: string;
    quantity: number;
    unit: string;
    price: number;
    line_total: number;
  }[];
  lines_title: string;
  lines_total: number;
  summary: string;
};

const MAX_PLAN_LINES = 12;

/** Guest asked for a specific number of dishes ("7", "7 items"). */
export function requestedDishCount(
  memory: GuestEventMemory,
  explicit?: number
): number | null {
  if (explicit != null && Number.isFinite(explicit)) {
    const n = Math.round(explicit);
    if (n >= 1 && n <= MAX_PLAN_LINES) return n;
  }
  for (const raw of memory.preferences || []) {
    const t = String(raw).trim().toLowerCase();
    const m =
      t.match(/^(\d{1,2})$/) ||
      t.match(/(\d{1,2})\s*(?:items?|dishes?|trays?|variet(?:y|ies))/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 3 && n <= MAX_PLAN_LINES) return n;
  }
  return null;
}

export type CartHintLine = {
  menu_item_id: string;
  variant_id?: string;
  name?: string;
  quantity: number;
  unit_price?: number;
};

function segCount(memory: GuestEventMemory, key: string): number {
  return (
    memory.headcount.segments.find((s) => s.key === key)?.count ??
    memory.requirement_groups.find((g) => g.kind === key)?.count ??
    0
  );
}

function pickVariantServes(item: MenuItem): {
  variant_id?: string;
  price: number;
  unit: string;
  serves: number;
  label: string;
} {
  const v = pickDefaultVariant(item);
  if (v) {
    return {
      variant_id: v.id,
      price: v.price,
      unit: v.unit || item.unit,
      serves: v.serves || 20,
      label: v.label,
    };
  }
  return {
    price: item.price,
    unit: item.unit,
    serves: 20,
    label: item.unit,
  };
}

function addLine(
  lines: PlanLine[],
  item: MenuItem,
  qty: number,
  coverageFor: string
) {
  if (qty <= 0) return;
  const v = pickVariantServes(item);
  const name = v.variant_id ? `${item.name} (${v.label})` : item.name;
  const existing = lines.find(
    (l) =>
      l.menu_item_id === item.id &&
      l.variant_id === v.variant_id &&
      l.coverage_for === coverageFor
  );
  if (existing) {
    existing.quantity += qty;
    existing.line_total = existing.quantity * existing.price;
    return;
  }
  lines.push({
    menu_item_id: item.id,
    variant_id: v.variant_id,
    name,
    quantity: qty,
    unit: v.unit,
    price: v.price,
    line_total: Math.round(qty * v.price * 100) / 100,
    serves: v.serves,
    coverage_for: coverageFor,
  });
}

function findPool(
  catalog: MenuItem[],
  filter: Parameters<typeof filterMenuItems>[1],
  declined: Set<string>
): MenuItem[] {
  const rows = filterMenuItems(catalog, { ...filter, limit: 80 });
  return rows
    .filter((r) => !declined.has(r.id.toLowerCase()) && !declined.has(r.name.toLowerCase()))
    .map((r) => catalog.find((i) => i.id === r.id)!)
    .filter(Boolean);
}

function rotatePick(pool: MenuItem[], n: number, start = 0): MenuItem[] {
  if (!pool.length || n <= 0) return [];
  const out: MenuItem[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    out.push(pool[(start + i) % pool.length]);
  }
  return out;
}

function validateCart(
  memory: GuestEventMemory,
  catalog: MenuItem[],
  cart: CartHintLine[]
): BuildPlanResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  const coverage: PlanCoverage[] = [];
  const items: PlanLine[] = [];

  const ae = adultEquivalent({
    adults: segCount(memory, "adults") || undefined,
    kids: segCount(memory, "kids") || undefined,
    toddlers: segCount(memory, "toddlers") || undefined,
    total: memory.headcount.total,
  });
  const need = effectiveHeadcount(
    ae,
    (memory.event.meal || "lunch") as MealKind
  );

  let totalServes = 0;
  let total = 0;
  for (const c of cart) {
    const item = catalog.find((i) => i.id === c.menu_item_id);
    if (!item) {
      warnings.push(`Unknown cart item ${c.menu_item_id}`);
      continue;
    }
    const v =
      (c.variant_id && item.variants?.find((x) => x.id === c.variant_id)) ||
      pickDefaultVariant(item);
    const serves = (v?.serves || 20) * c.quantity;
    totalServes += serves;
    const price = c.unit_price ?? v?.price ?? item.price;
    const lineTotal = Math.round(price * c.quantity * 100) / 100;
    total += lineTotal;
    items.push({
      menu_item_id: item.id,
      variant_id: v?.id,
      name: c.name || (v ? `${item.name} (${v.label})` : item.name),
      quantity: c.quantity,
      unit: v?.unit || item.unit,
      price,
      line_total: lineTotal,
      serves: v?.serves,
      coverage_for: "cart",
    });
  }

  const low = need * 0.7;
  const high = need * 1.3;
  if (need > 0) {
    if (totalServes < low) {
      warnings.push(
        `Cart may be light: ~${Math.round(totalServes)} serves vs ~${Math.round(need)} needed (±30% band).`
      );
    } else if (totalServes > high) {
      notes.push(
        `Cart is generous: ~${Math.round(totalServes)} serves vs ~${Math.round(need)} needed.`
      );
    } else {
      notes.push("Cart quantity looks reasonable for headcount (±30%).");
    }
  }

  for (const g of memory.requirement_groups) {
    if (g.kind === "allergy") {
      const allergen = (g.allergen || "").toLowerCase();
      const unsafe = items.filter((line) => {
        const mi = catalog.find((i) => i.id === line.menu_item_id);
        if (!mi) return true;
        const tags = derivePlanningTags(mi);
        if (!tags.allergens.length) return true;
        return tags.allergens.some(
          (a) => a.includes(allergen) || allergen.includes(a)
        );
      });
      coverage.push({
        group: `allergy:${g.allergen}`,
        guests: g.count,
        covered_by: items.map((i) => i.name),
        ok: unsafe.length === 0,
        note:
          unsafe.length > 0
            ? `Possible allergen risk on: ${unsafe.map((u) => u.name).join(", ")}. Escalate if unsure.`
            : "No listed allergen match on cart items (unknown tags still risky).",
      });
      if (unsafe.length) warnings.push(coverage[coverage.length - 1].note!);
    } else if (g.kind === "jain" || g.kind === "vegan") {
      const okItems = items.filter((line) => {
        const mi = catalog.find((i) => i.id === line.menu_item_id);
        if (!mi) return false;
        const tags = derivePlanningTags(mi);
        return g.kind === "jain" ? tags.jain_ok : tags.vegan;
      });
      coverage.push({
        group: g.kind,
        guests: g.count,
        covered_by: okItems.map((i) => i.name),
        ok: okItems.length > 0,
        note:
          okItems.length === 0
            ? `No clear ${g.kind} items in cart — consider dedicated trays.`
            : undefined,
      });
      if (!okItems.length) warnings.push(coverage[coverage.length - 1].note!);
    }
  }

  const perHead =
    memory.headcount.total && memory.headcount.total > 0
      ? Math.round((total / memory.headcount.total) * 100) / 100
      : null;

  return {
    ok: warnings.length === 0,
    mode: "validate",
    items,
    per_head: perHead,
    total: Math.round(total * 100) / 100,
    coverage,
    timeline: [],
    warnings,
    notes,
    lines: items.slice(0, MAX_PLAN_LINES).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      line_total: i.line_total,
    })),
    lines_title: "Your cart (validated)",
    lines_total: Math.round(total * 100) / 100,
    summary: warnings.length
      ? `Validated cart with ${warnings.length} warning(s).`
      : "Cart validated against guest memory.",
  };
}

/**
 * Deterministic planning engine v1.
 * Allocates restrictive groups first, then kids, then general pool.
 */
export function buildPlan(input: {
  memory: GuestEventMemory;
  catalog: MenuItem[];
  /** When cart has items and replace is false → validate only */
  cart_items?: CartHintLine[];
  replace?: boolean;
  prefer_item_ids?: string[];
  /** How many distinct dishes the guest asked for. */
  dish_count?: number;
}): BuildPlanResult {
  const { memory, catalog } = input;
  const declined = new Set(
    memory.declined_suggestions.map((d) => d.toLowerCase())
  );

  if (
    input.cart_items?.length &&
    !input.replace
  ) {
    return validateCart(memory, catalog, input.cart_items);
  }

  const warnings: string[] = [...memory.conflicts];
  const notes: string[] = [];
  const coverage: PlanCoverage[] = [];
  const lines: PlanLine[] = [];

  const total =
    memory.headcount.total ??
    Math.max(
      segmentSumSafe(memory),
      0
    );
  if (!total || total <= 0) {
    return {
      ok: false,
      mode: "build",
      items: [],
      per_head: null,
      total: 0,
      coverage: [],
      timeline: [],
      warnings: ["Need headcount before building a plan."],
      notes: ["Ask total guests (and Jain/vegan/kids segments if relevant)."],
      lines: [],
      lines_title: "",
      lines_total: 0,
      summary: "Missing headcount.",
    };
  }

  const adults = segCount(memory, "adults") || Math.max(0, total - segCount(memory, "kids") - segCount(memory, "toddlers"));
  const kids = segCount(memory, "kids");
  const toddlers = segCount(memory, "toddlers");
  const jain = segCount(memory, "jain");
  const vegan = segCount(memory, "vegan");
  const ae = adultEquivalent({ adults, kids, toddlers, total });
  const meal = (memory.event.meal || "lunch") as MealKind;
  const need = effectiveHeadcount(ae, meal);

  // 1) Restrictive groups — dedicated trays
  for (const g of memory.requirement_groups) {
    if (g.count <= 0) continue;
    if (g.kind === "jain") {
      const pool = findPool(catalog, { jain_ok: true }, declined);
      const picks = rotatePick(pool, 2);
      if (!picks.length) {
        warnings.push("No Jain-tagged items available for dedicated trays.");
        coverage.push({
          group: "jain",
          guests: g.count,
          covered_by: [],
          ok: false,
          note: "Cannot allocate Jain trays from catalog tags.",
        });
        continue;
      }
      const covered: string[] = [];
      for (const p of picks) {
        const v = pickVariantServes(p);
        const qty = traysForServes(g.count, v.serves);
        addLine(lines, p, Math.max(PORTION_RULES.min_dedicated_trays, qty), "jain");
        covered.push(p.name);
      }
      coverage.push({ group: "jain", guests: g.count, covered_by: covered, ok: true });
    } else if (g.kind === "vegan") {
      const pool = findPool(catalog, { vegan: true }, declined);
      const picks = rotatePick(pool, 2, 1);
      if (!picks.length) {
        warnings.push("No vegan-tagged items available.");
        coverage.push({
          group: "vegan",
          guests: g.count,
          covered_by: [],
          ok: false,
        });
        continue;
      }
      const covered: string[] = [];
      for (const p of picks) {
        const v = pickVariantServes(p);
        const qty = traysForServes(g.count, v.serves);
        addLine(lines, p, Math.max(PORTION_RULES.min_dedicated_trays, qty), "vegan");
        covered.push(p.name);
      }
      coverage.push({ group: "vegan", guests: g.count, covered_by: covered, ok: true });
    } else if (g.kind === "allergy") {
      const allergen = g.allergen || "";
      const pool = findPool(
        catalog,
        { exclude_allergen: allergen },
        declined
      );
      // Prefer items with known allergen lists that exclude this allergen
      const safe = pool.filter((p) => {
        const tags = derivePlanningTags(p);
        return tags.allergens.length > 0;
      });
      const use = safe.length ? safe : [];
      if (!use.length) {
        warnings.push(
          `Cannot safely auto-pick for ${allergen} allergy (unknown kitchen allergens). Escalate via WhatsApp.`
        );
        coverage.push({
          group: `allergy:${allergen}`,
          guests: g.count,
          covered_by: [],
          ok: false,
          note: "Unknown allergen tags — do not invent; escalate.",
        });
        continue;
      }
      const picks = rotatePick(use, 2);
      const covered: string[] = [];
      for (const p of picks) {
        const v = pickVariantServes(p);
        const qty = traysForServes(g.count, v.serves);
        addLine(lines, p, Math.max(1, qty), `allergy:${allergen}`);
        covered.push(p.name);
      }
      coverage.push({
        group: `allergy:${allergen}`,
        guests: g.count,
        covered_by: covered,
        ok: true,
        note: "Selected only items with known allergen lists excluding this allergen.",
      });
    }
  }

  // 2) Kids / toddlers — mild + kid_friendly
  const young = kids + toddlers;
  if (young > 0) {
    const pool = findPool(
      catalog,
      { kid_friendly: true, spice_max: "mild" },
      declined
    );
    const picks = rotatePick(pool.length ? pool : findPool(catalog, { kid_friendly: true }, declined), 2);
    const covered: string[] = [];
    for (const p of picks) {
      const v = pickVariantServes(p);
      const qty = traysForServes(young, v.serves);
      addLine(lines, p, qty, "kids");
      covered.push(p.name);
    }
    coverage.push({
      group: "kids",
      guests: young,
      covered_by: covered,
      ok: covered.length > 0,
    });
  }

  // 3) General pool — remaining adult-equivalent not covered by dedicated
  const dedicatedGuests = jain + vegan;
  const generalGuests = Math.max(0, need - dedicatedGuests * 0.5);
  const dietFilter =
    memory.requirement_groups.some((g) => g.kind === "vegan" && g.count >= total * 0.8)
      ? { vegan: true }
      : memory.requirement_groups.some((g) => g.kind === "jain" && g.count >= total * 0.8)
        ? { jain_ok: true }
        : {};

  // Prefer famous combinations + balanced roles (never appetizer-only spreads)
  const preferIds = [...(input.prefer_item_ids || [])];
  const cartSeedIds = (input.cart_items || [])
    .map((c) => c.menu_item_id)
    .filter(Boolean);
  const seedIds = Array.from(new Set([...preferIds, ...cartSeedIds]));

  const hints: string[] = [];
  if (dietFilter.vegan) hints.push("vegan");
  if (dietFilter.jain_ok) hints.push("jain");
  if (memory.event.meal) hints.push(memory.event.meal);
  if (memory.event.occasion) {
    const o = memory.event.occasion.toLowerCase();
    hints.push(o);
    if (/pizza|kid|birthday|office/.test(o)) hints.push("party");
    if (/italian|pasta/.test(o)) hints.push("italian");
  }
  const dietLower = (memory.requirement_groups.find((g) => g.kind === "vegan")
    ? "vegan"
    : memory.requirement_groups.find((g) => g.kind === "jain")
      ? "jain"
      : "") || "";
  if (dietLower) hints.push(dietLower);

  const catalogIds = new Set(catalog.map((i) => i.id));
  const combo = pickBestCombo({
    catalogIds,
    item_ids: seedIds,
    hints: hints.length ? hints : ["indian", "lunch", "dinner", "buffet"],
    declined,
  });

  const already = new Set(lines.map((l) => l.menu_item_id));
  const picks: MenuItem[] = [];
  const comboNotes: string[] = [];
  const requestedLines = requestedDishCount(memory, input.dish_count);
  const generalCap =
    requestedLines != null
      ? Math.max(0, requestedLines - lines.length)
      : PORTION_RULES.max_main_variety + 2;

  if (combo) {
    for (const id of combo.item_ids) {
      const item = catalog.find((i) => i.id === id);
      if (!item || already.has(item.id) || declined.has(item.id.toLowerCase())) {
        continue;
      }
      if (dietFilter.vegan && !derivePlanningTags(item).vegan) continue;
      if (dietFilter.jain_ok && !derivePlanningTags(item).jain_ok) continue;
      picks.push(item);
      already.add(item.id);
    }
    if (picks.length) {
      comboNotes.push(`Famous combo: ${combo.name} — ${combo.why}`);
    }
  }

  // Fill missing meal roles so we never ship 4 appetizers as a "best menu"
  const roleTargets: ComboRole[] = ["main", "starch", "bread", "dal", "appetizer"];
  const rolesPresent = new Set<ComboRole>();
  for (const p of picks) {
    const r = categoryToRole(p.category_id);
    if (r) rolesPresent.add(r);
  }
  // Pizza combos count as main+starch substitute
  if (rolesPresent.has("pizza")) {
    rolesPresent.add("main");
  }

  const pool = findPool(catalog, { ...dietFilter, available_only: true }, declined);
  const byRole = (role: ComboRole) =>
    pool.filter((i) => categoryToRole(i.category_id) === role && !already.has(i.id));

  for (const role of roleTargets) {
    if (rolesPresent.has(role)) continue;
    // Skip dal if we already have two mains; skip appetizer if chaat-heavy combo already added starters
    if (role === "dal" && rolesPresent.has("main") && picks.length >= 4) continue;
    const candidates = byRole(role);
    if (!candidates.length) continue;
    // Prefer items that appear in famous combos with what we already picked
    const extend = pickBestCombo({
      catalogIds,
      item_ids: picks.map((p) => p.id),
      hints,
      declined,
    });
    let chosen: MenuItem | undefined;
    if (extend) {
      chosen = extend.item_ids
        .map((id) => candidates.find((c) => c.id === id))
        .find(Boolean);
    }
    if (!chosen) chosen = candidates[0];
    picks.push(chosen);
    already.add(chosen.id);
    rolesPresent.add(role);
    if (picks.length >= generalCap) break;
  }

  // Prefer ids from caller last if still thin
  for (const id of preferIds) {
    if (picks.length >= generalCap) break;
    const item = catalog.find((i) => i.id === id);
    if (!item || already.has(item.id)) continue;
    picks.push(item);
    already.add(item.id);
  }

  if (picks.length < generalCap) {
    for (const item of pool) {
      if (picks.length >= generalCap) break;
      if (already.has(item.id)) continue;
      const role = categoryToRole(item.category_id);
      if (role === "appetizer" || role === "chaat") continue;
      picks.push(item);
      already.add(item.id);
    }
  }

  if (requestedLines != null && picks.length > generalCap) {
    picks.splice(generalCap);
  }

  if (!picks.length && generalGuests > 0 && generalCap > 0) {
    warnings.push("Could not find general menu items for the plan.");
  }

  // Cap appetizers — at most 2 starter/chaat lines in the general plan
  const capped: MenuItem[] = [];
  let apps = 0;
  for (const p of picks) {
    const role = categoryToRole(p.category_id);
    if (role === "appetizer" || role === "chaat") {
      if (apps >= 2) continue;
      apps++;
    }
    capped.push(p);
  }
  const finalPicks = capped.length ? capped : picks;
  if (requestedLines != null && finalPicks.length < generalCap) {
    const have = new Set(finalPicks.map((p) => p.id));
    for (const item of pool) {
      if (finalPicks.length >= generalCap) break;
      if (have.has(item.id)) continue;
      const role = categoryToRole(item.category_id);
      if (role === "appetizer" || role === "chaat") continue;
      finalPicks.push(item);
      have.add(item.id);
    }
  }

  const perDish = finalPicks.length
    ? generalGuests / finalPicks.length
    : generalGuests;
  const coveredGeneral: string[] = [];
  for (const p of finalPicks) {
    const role = categoryToRole(p.category_id);
    // Starters cover fewer people per tray in a full meal context
    const share =
      role === "appetizer" || role === "dessert" || role === "salad"
        ? perDish * 0.7
        : perDish;
    const v = pickVariantServes(p);
    const qty = traysForServes(Math.max(share, total * 0.35), v.serves);
    addLine(lines, p, qty, "general");
    coveredGeneral.push(p.name);
  }
  notes.push(...comboNotes);
  if (!comboNotes.length) {
    notes.push(
      "Built a balanced plate (mains + starch/bread) using classic catering pairings — not appetizers alone."
    );
  }
  coverage.push({
    group: "general",
    guests: Math.round(generalGuests),
    covered_by: coveredGeneral,
    ok: coveredGeneral.length > 0,
  });

  // Collapse duplicate menu lines for display (sum qty)
  let collapsed = collapseLines(lines);

  // 4) Budget fit — guest-happy cuts only (never random); keep sufficient food
  const budget =
    memory.event.budget != null && memory.event.budget > 0
      ? Number(memory.event.budget)
      : null;
  if (budget != null) {
    const fit = fitPlanToBudget({
      lines: collapsed,
      budget,
      neededServes: need,
      catalog,
    });
    collapsed = fit.lines as PlanLine[];
    warnings.push(...fit.warnings);
    notes.push(...fit.notes);
    if (fit.actions.length) {
      notes.push(...fit.actions.slice(0, 4));
    }
  }

  const displayCap = Math.min(
    MAX_PLAN_LINES,
    requestedLines != null ? requestedLines : collapsed.length
  );
  const shown = collapsed.slice(0, displayCap);
  if (requestedLines != null && shown.length < requestedLines) {
    notes.push(
      `Guest asked for ${requestedLines} dishes; the catalog could support ${shown.length}.`
    );
  }

  const money = shown.reduce((s, l) => s + l.line_total, 0);
  const perHead =
    total > 0 ? Math.round((money / total) * 100) / 100 : null;

  // 5) Timeline
  const timeline: PlanTimeline[] = [];
  if (memory.timeline.length) {
    for (const slot of memory.timeline) {
      timeline.push({
        label: slot.label,
        time: slot.time,
        items: shown.slice(0, 4).map((l) => l.name),
      });
    }
  } else {
    const mealTime = memory.event.meal_time;
    const delivery = mealTime
      ? subtractMinutes(mealTime, PORTION_RULES.delivery_lead_minutes)
      : undefined;
    timeline.push({
      label: "Single delivery",
      time: delivery,
      items: shown.map((l) => l.name),
    });
    if (mealTime) {
      notes.push(
        `Plan delivery around ${delivery} (~${PORTION_RULES.delivery_lead_minutes} min before meal at ${mealTime}).`
      );
    } else {
      notes.push("Ask meal time so we can schedule delivery ~20 minutes before.");
    }
  }

  notes.push("Catch-all: any other allergies, Jain/vegan counts, or kids we should cover?");

  return {
    ok: warnings.filter((w) => w.includes("Cannot") || w.includes("Missing")).length === 0,
    mode: "build",
    items: shown,
    per_head: perHead,
    total: Math.round(money * 100) / 100,
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
    })),
    lines_title:
      total && dietFilter.vegan
        ? `Suggested for ${total} vegan guests`
        : `Suggested for ${total} guests`,
    lines_total: Math.round(money * 100) / 100,
    summary: `Built plan: ${shown.length} line(s), $${Math.round(money)} total` +
      (perHead != null ? ` (~$${perHead}/guest).` : ".") +
      (budget != null ? ` Budget $${budget}.` : ""),
  };
}

function segmentSumSafe(memory: GuestEventMemory): number {
  return memory.headcount.segments.reduce((s, seg) => s + seg.count, 0);
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

/** Lightweight row export for get_menu tool */
export function menuRowsForTool(rows: PlanningMenuRow[]) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    unit: r.unit,
    serves: r.serves,
    variant_id: r.variant_id,
    diet_tags: r.diet_tags,
    tags: {
      jain_ok: r.tags.jain_ok,
      vegan: r.tags.vegan,
      no_onion_garlic_ok: r.tags.no_onion_garlic_ok,
      allergens: r.tags.allergens,
      gluten_status: r.tags.gluten_status,
      spice_level: r.tags.spice_level,
      kid_friendly: r.tags.kid_friendly,
    },
  }));
}
