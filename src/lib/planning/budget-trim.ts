import type { MenuItem } from "@/lib/types";
import { PORTION_RULES } from "@/lib/planning/portion-rules";

/**
 * Guest-happy budget fitting: never remove randomly.
 * Prefer cutting extras / variety before staples; never starve restriction
 * groups or drop below a sufficient serve floor.
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
  | "dedicated" // jain / vegan / allergy trays — last to cut
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
  min_serve_ratio: 0.9,
  /** Keep at least this many distinct "eatable core" lines (main+starch preferred) */
  min_core_lines: 2,
  /** Prefer downsizing before deleting when qty > 1 */
  prefer_qty_reduce: true,
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
  if (
    cat === "cat-rice-noodles" ||
    cat === "cat-breads-rotis"
  ) {
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

function countCore(lines: BudgetPlanLine[], catalog: MenuItem[]): number {
  let mains = 0;
  let starch = 0;
  for (const l of lines) {
    const r = classifyLineRole(l, catalog);
    if (r === "main" || r === "dedicated") mains++;
    if (r === "starch") starch++;
  }
  // A dedicated tray also counts as food; starch alone is weak
  return mains + (starch > 0 ? 1 : 0);
}

function hasRole(lines: BudgetPlanLine[], catalog: MenuItem[], role: LineRole) {
  return lines.some((l) => classifyLineRole(l, catalog) === role);
}

function canRemoveLine(
  lines: BudgetPlanLine[],
  index: number,
  catalog: MenuItem[],
  neededServes: number
): boolean {
  const next = lines.filter((_, i) => i !== index);
  if (!next.length) return false;
  const role = classifyLineRole(lines[index], catalog);
  if (role === "dedicated") {
    // Never remove the last dedicated line for that coverage tag
    const cov = lines[index].coverage_for || "";
    const siblings = next.filter((l) => l.coverage_for === cov);
    if (!siblings.length) return false;
  }
  if (role === "kids") {
    if (!hasRole(next, catalog, "kids")) return false;
  }
  if (totalServes(next) < neededServes * BUDGET_TRIM.min_serve_ratio) {
    return false;
  }
  if (countCore(next, catalog) < BUDGET_TRIM.min_core_lines) {
    // Allow if still have at least one main/dedicated
    if (!hasRole(next, catalog, "main") && !hasRole(next, catalog, "dedicated")) {
      return false;
    }
  }
  // Keep at least one starch OR one main when cutting extras is done
  if (role === "starch" && !hasRole(next, catalog, "starch")) {
    // ok to remove only if we still have enough mains
    if (!hasRole(next, catalog, "main") && !hasRole(next, catalog, "dedicated")) {
      return false;
    }
  }
  if (role === "main") {
    const mainsLeft = next.filter(
      (l) => classifyLineRole(l, catalog) === "main"
    ).length;
    const dedicatedLeft = next.filter(
      (l) => classifyLineRole(l, catalog) === "dedicated"
    ).length;
    if (mainsLeft + dedicatedLeft < 1) return false;
  }
  return true;
}

function canReduceQty(
  lines: BudgetPlanLine[],
  index: number,
  catalog: MenuItem[],
  neededServes: number
): boolean {
  const line = lines[index];
  if (line.quantity <= 1) return false;
  const trial = lines.map((l, i) =>
    i === index ? recompute({ ...l, quantity: l.quantity - 1 }) : l
  );
  if (totalServes(trial) < neededServes * BUDGET_TRIM.min_serve_ratio) {
    return false;
  }
  const role = classifyLineRole(line, catalog);
  // Dedicated: keep at least min_dedicated_trays
  if (role === "dedicated" && line.quantity - 1 < PORTION_RULES.min_dedicated_trays) {
    return false;
  }
  return true;
}

export type BudgetTrimResult = {
  lines: BudgetPlanLine[];
  total: number;
  trimmed: boolean;
  actions: string[];
  warnings: string[];
  notes: string[];
  within_budget: boolean;
};

/**
 * Fit plan under budget without starving guests or gutting happiness.
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

  if (!(budget > 0) || totalCost(lines) <= budget) {
    return {
      lines,
      total: totalCost(lines),
      trimmed: false,
      actions: [],
      warnings: [],
      notes: [],
      within_budget: !(budget > 0) || totalCost(lines) <= budget,
    };
  }

  notes.push(
    `Fitting plan to ~$${budget} budget while keeping enough food for guests.`
  );

  /** Extras guests can skip before we touch staple food. */
  const EXTRA_PRIORITY = CUT_PRIORITY.fresh; // dessert, extra, fresh

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
      if (!canReduceQty(lines, c.index, input.catalog, input.neededServes)) {
        continue;
      }
      const nextQty = c.line.quantity - 1;
      lines = lines.map((l, i) =>
        i === c.index ? recompute({ ...l, quantity: nextQty }) : l
      );
      actions.push(
        `Reduced ${c.line.name} to ${nextQty} (kept on menu for guests).`
      );
      return true;
    }
    return false;
  };

  const tryRemove = (minPriority: number, maxPriority = 999): boolean => {
    for (const c of ranked()) {
      if (c.priority < minPriority || c.priority > maxPriority) continue;
      if (!canRemoveLine(lines, c.index, input.catalog, input.neededServes)) {
        continue;
      }
      const removed = lines[c.index];
      lines = lines.filter((_, i) => i !== c.index);
      actions.push(
        `Removed ${removed.name} to fit budget (kept core mains/staples).`
      );
      return true;
    }
    return false;
  };

  // Phases: extras first (happiness-safe), then staple qty, then staple removal if still needed.
  const maxSteps = 40;
  for (let step = 0; step < maxSteps && totalCost(lines) > budget; step++) {
    let acted = false;
    // 1) Reduce dessert/extra/fresh qty
    if (BUDGET_TRIM.prefer_qty_reduce) {
      acted = tryReduce(EXTRA_PRIORITY);
    }
    // 2) Remove dessert/extra/fresh entirely
    if (!acted) acted = tryRemove(EXTRA_PRIORITY);
    // 3) Only then reduce staple tray counts (mains/starch/kids) — never random
    if (!acted && BUDGET_TRIM.prefer_qty_reduce) {
      acted = tryReduce(0, EXTRA_PRIORITY - 1);
    }
    // 4) Last resort: remove a non-core line if still over and safe
    if (!acted) acted = tryRemove(0, EXTRA_PRIORITY - 1);
    if (!acted) break;
  }

  const finalTotal = totalCost(lines);
  const within = finalTotal <= budget;
  if (!within) {
    warnings.push(
      `Could not reach $${budget} without underfeeding guests. Kept a sufficient menu at $${finalTotal} — ask if they want a smaller headcount plan or a simpler package.`
    );
  } else if (actions.length) {
    notes.push(
      "Cuts favored desserts/extras and reducing tray counts — not random removals — so guests still eat well."
    );
  }

  const serves = totalServes(lines);
  if (serves < input.neededServes * BUDGET_TRIM.min_serve_ratio) {
    warnings.push(
      "Serve coverage is tight after budget trim — confirm headcount or raise budget slightly."
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
  };
}
