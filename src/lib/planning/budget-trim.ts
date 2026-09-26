import type { MenuItem } from "@/lib/types";
import { PORTION_RULES } from "@/lib/planning/portion-rules";

/**
 * Guest-happy budget fitting.
 * Satisfaction is non-negotiable: never gut the meal to hit a number.
 * Prefer an honest "budget too tight" warning over a disappointing menu.
 */

/** Minimal line shape (matches planning engine PlanLine). */
export type BudgetPlanLine = {
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

export type LineRole =
  | "dedicated" // jain / vegan / allergy trays — never compromise
  | "kids"
  | "main" // vegetable / pasta / pizza mains
  | "starch" // rice / bread / noodles
  | "fresh" // salad / light fresh
  | "dessert"
  | "extra" // appetizer-heavy extras, condiments, sides
  | "other";

/** Higher = safer to cut first when over budget */
const CUT_PRIORITY: Record<LineRole, number> = {
  dessert: 100,
  extra: 80,
  fresh: 55,
  other: 50,
  main: 30,
  starch: 25,
  kids: 15,
  dedicated: 5,
};

export const BUDGET_TRIM = {
  /** Never go below this fraction of needed guest-serves when trimming */
  min_serve_ratio: 0.95,
  /** Prefer downsizing before deleting when qty > 1 */
  prefer_qty_reduce: true,
  /**
   * Minimum distinct savory mains (main + dedicated) so the spread still feels
   * like a real meal, not a single lonely tray.
   */
  min_savory_variety: 2,
  /** Always keep a starch (rice/bread) with mains when one was on the plan */
  require_starch_with_mains: true,
} as const;

export function classifyLineRole(
  line: BudgetPlanLine,
  catalog: MenuItem[]
): LineRole {
  const cov = (line.coverage_for || "").toLowerCase();
  if (
    cov.includes("jain") ||
    cov.includes("vegan") ||
    cov.includes("allergy")
  ) {
    return "dedicated";
  }
  if (cov.includes("kids")) return "kids";

  const item = catalog.find((m) => m.id === line.menu_item_id);
  const cat = item?.category_id || "";
  if (cat === "cat-desserts") return "dessert";
  if (cat === "cat-condiments" || cat === "cat-sides") return "extra";
  if (cat === "cat-appetizers") return "extra";
  if (cat === "cat-salads") return "fresh";
  if (cat === "cat-rice-noodles" || cat === "cat-breads-rotis") {
    return "starch";
  }
  if (
    cat === "cat-vegetable-dishes" ||
    cat === "cat-dal-soups" ||
    cat === "cat-pastas" ||
    cat === "cat-pizzas"
  ) {
    return "main";
  }
  return "other";
}

function lineServes(line: BudgetPlanLine): number {
  const per = line.serves && line.serves > 0 ? line.serves : 20;
  return per * line.quantity;
}

function totalServes(lines: BudgetPlanLine[]): number {
  return lines.reduce((s, l) => s + lineServes(l), 0);
}

function totalCost(lines: BudgetPlanLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
}

function recompute(line: BudgetPlanLine): BudgetPlanLine {
  return {
    ...line,
    line_total: Math.round(line.quantity * line.price * 100) / 100,
  };
}

function hasRole(lines: BudgetPlanLine[], catalog: MenuItem[], role: LineRole) {
  return lines.some((l) => classifyLineRole(l, catalog) === role);
}

function savoryCount(lines: BudgetPlanLine[], catalog: MenuItem[]): number {
  return lines.filter((l) => {
    const r = classifyLineRole(l, catalog);
    return r === "main" || r === "dedicated";
  }).length;
}

function dedicatedCoverageKeys(lines: BudgetPlanLine[]): Set<string> {
  const keys = new Set<string>();
  for (const l of lines) {
    const cov = (l.coverage_for || "").toLowerCase();
    if (
      cov.includes("jain") ||
      cov.includes("vegan") ||
      cov.includes("allergy")
    ) {
      keys.add(l.coverage_for || cov);
    }
  }
  return keys;
}

export type SatisfactionSnapshot = {
  had_starch: boolean;
  had_kids: boolean;
  dedicated_keys: Set<string>;
  savory_variety: number;
};

export function snapshotSatisfaction(
  lines: BudgetPlanLine[],
  catalog: MenuItem[]
): SatisfactionSnapshot {
  return {
    had_starch: hasRole(lines, catalog, "starch"),
    had_kids: hasRole(lines, catalog, "kids"),
    dedicated_keys: dedicatedCoverageKeys(lines),
    savory_variety: savoryCount(lines, catalog),
  };
}

/**
 * Hard floor: quantity + a menu guests will still enjoy.
 * Satisfaction cannot be compromised to chase budget.
 */
export function guestSatisfactionOk(
  lines: BudgetPlanLine[],
  catalog: MenuItem[],
  neededServes: number,
  baseline: SatisfactionSnapshot
): { ok: boolean; reason?: string } {
  if (!lines.length) {
    return { ok: false, reason: "empty menu" };
  }
  if (totalServes(lines) < neededServes * BUDGET_TRIM.min_serve_ratio) {
    return { ok: false, reason: "not enough food for the headcount" };
  }
  if (!hasRole(lines, catalog, "main") && !hasRole(lines, catalog, "dedicated")) {
    return { ok: false, reason: "no main dish left for guests" };
  }
  // Keep a complete plate: mains + starch when starch was part of the plan
  if (
    BUDGET_TRIM.require_starch_with_mains &&
    baseline.had_starch &&
    !hasRole(lines, catalog, "starch")
  ) {
    return { ok: false, reason: "lost rice/bread — meal would feel incomplete" };
  }
  // Kids trays are satisfaction-critical when kids were planned
  if (baseline.had_kids && !hasRole(lines, catalog, "kids")) {
    return { ok: false, reason: "kids food removed" };
  }
  // Every dedicated restriction group must still have food
  for (const key of baseline.dedicated_keys) {
    const still = lines.some((l) => (l.coverage_for || "") === key);
    if (!still) {
      return { ok: false, reason: `lost dedicated food for ${key}` };
    }
  }
  // Preserve savory variety so guests are not stuck with one lonely tray
  const minVariety = Math.min(
    BUDGET_TRIM.min_savory_variety,
    Math.max(1, baseline.savory_variety)
  );
  if (savoryCount(lines, catalog) < minVariety) {
    return {
      ok: false,
      reason: "not enough variety — guests would be disappointed",
    };
  }
  return { ok: true };
}

function canRemoveLine(
  lines: BudgetPlanLine[],
  index: number,
  catalog: MenuItem[],
  neededServes: number,
  baseline: SatisfactionSnapshot
): boolean {
  const role = classifyLineRole(lines[index], catalog);
  // Never remove satisfaction-critical roles — only extras may go
  if (
    role === "dedicated" ||
    role === "kids" ||
    role === "starch" ||
    role === "main"
  ) {
    return false;
  }
  const next = lines.filter((_, i) => i !== index);
  return guestSatisfactionOk(next, catalog, neededServes, baseline).ok;
}

function canReduceQty(
  lines: BudgetPlanLine[],
  index: number,
  catalog: MenuItem[],
  neededServes: number,
  baseline: SatisfactionSnapshot
): boolean {
  const line = lines[index];
  if (line.quantity <= 1) return false;
  const role = classifyLineRole(line, catalog);
  if (role === "dedicated" && line.quantity - 1 < PORTION_RULES.min_dedicated_trays) {
    return false;
  }
  // Do not thin kids / dedicated below a single tray
  if ((role === "kids" || role === "dedicated") && line.quantity <= 1) {
    return false;
  }
  const trial = lines.map((l, i) =>
    i === index ? recompute({ ...l, quantity: l.quantity - 1 }) : l
  );
  return guestSatisfactionOk(trial, catalog, neededServes, baseline).ok;
}

export type BudgetTrimResult = {
  lines: BudgetPlanLine[];
  total: number;
  trimmed: boolean;
  actions: string[];
  warnings: string[];
  notes: string[];
  within_budget: boolean;
  satisfaction_preserved: boolean;
};

/**
 * Fit plan under budget without compromising guest satisfaction.
 * If budget and satisfaction conflict, keep the satisfying menu and warn.
 */
export function fitPlanToBudget(input: {
  lines: BudgetPlanLine[];
  budget: number;
  neededServes: number;
  catalog: MenuItem[];
}): BudgetTrimResult {
  const budget = input.budget;
  let lines = input.lines.map((l) => recompute({ ...l }));
  const actions: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const baseline = snapshotSatisfaction(lines, input.catalog);

  if (!(budget > 0) || totalCost(lines) <= budget) {
    return {
      lines,
      total: totalCost(lines),
      trimmed: false,
      actions: [],
      warnings: [],
      notes: [],
      within_budget: !(budget > 0) || totalCost(lines) <= budget,
      satisfaction_preserved: true,
    };
  }

  notes.push(
    `Fitting plan to ~$${budget} while protecting guest satisfaction (enough food, mains + bread/rice, kids & diet trays).`
  );

  /** Only dessert / extra / fresh / other may be removed. */
  const REMOVABLE_MIN = CUT_PRIORITY.other;

  const ranked = () =>
    lines
      .map((l, index) => ({
        index,
        line: l,
        role: classifyLineRole(l, input.catalog),
        priority: CUT_PRIORITY[classifyLineRole(l, input.catalog)],
        cost: l.line_total,
      }))
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.cost - a.cost;
      });

  const tryReduce = (minPriority: number, maxPriority = 999): boolean => {
    for (const c of ranked()) {
      if (c.priority < minPriority || c.priority > maxPriority) continue;
      if (
        !canReduceQty(
          lines,
          c.index,
          input.catalog,
          input.neededServes,
          baseline
        )
      ) {
        continue;
      }
      const nextQty = c.line.quantity - 1;
      lines = lines.map((l, i) =>
        i === c.index ? recompute({ ...l, quantity: nextQty }) : l
      );
      actions.push(
        `Reduced ${c.line.name} to ${nextQty} (kept on menu so guests stay happy).`
      );
      return true;
    }
    return false;
  };

  const tryRemove = (minPriority: number, maxPriority = 999): boolean => {
    for (const c of ranked()) {
      if (c.priority < minPriority || c.priority > maxPriority) continue;
      if (
        !canRemoveLine(
          lines,
          c.index,
          input.catalog,
          input.neededServes,
          baseline
        )
      ) {
        continue;
      }
      const removed = lines[c.index];
      lines = lines.filter((_, i) => i !== c.index);
      actions.push(
        `Removed ${removed.name} to fit budget (kept satisfying mains/staples).`
      );
      return true;
    }
    return false;
  };

  // Phases: optional extras first; then thin staple qty slightly — never remove staples.
  const maxSteps = 40;
  for (let step = 0; step < maxSteps && totalCost(lines) > budget; step++) {
    let acted = false;
    if (BUDGET_TRIM.prefer_qty_reduce) {
      acted = tryReduce(REMOVABLE_MIN);
    }
    if (!acted) acted = tryRemove(REMOVABLE_MIN);
    // Soften staple quantities only if still over — never delete mains/starch/kids
    if (!acted && BUDGET_TRIM.prefer_qty_reduce) {
      acted = tryReduce(0, REMOVABLE_MIN - 1);
    }
    if (!acted) break;
  }

  const finalCheck = guestSatisfactionOk(
    lines,
    input.catalog,
    input.neededServes,
    baseline
  );
  // Safety net: if somehow broken, refuse the trim path (should not happen)
  if (!finalCheck.ok) {
    warnings.push(
      `Stopped budget cuts to protect guest satisfaction (${finalCheck.reason}).`
    );
  }

  const finalTotal = totalCost(lines);
  const within = finalTotal <= budget;
  if (!within) {
    warnings.push(
      `Could not reach $${budget} without compromising guest satisfaction. Kept a menu guests will enjoy at $${finalTotal} — suggest a slightly higher budget, a simpler occasion package, or a lower headcount rather than a disappointing spread.`
    );
  } else if (actions.length) {
    notes.push(
      "Budget cuts only touched optional extras or slight tray reductions — guest satisfaction (variety, staples, kids, diet trays) was not compromised."
    );
  }

  return {
    lines,
    total: finalTotal,
    trimmed: actions.length > 0,
    actions,
    warnings,
    notes,
    within_budget: within,
    satisfaction_preserved: finalCheck.ok,
  };
}
