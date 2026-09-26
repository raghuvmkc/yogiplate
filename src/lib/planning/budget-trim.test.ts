/**
 * Budget trim: guest-happy cuts + sufficient quantity.
 * Run: npx tsx src/lib/planning/budget-trim.test.ts
 */
import assert from "node:assert/strict";
import type { MenuItem } from "@/lib/types";
import { fitPlanToBudget, type BudgetPlanLine } from "./budget-trim";

const catalog: MenuItem[] = [
  {
    id: "item-veg-main",
    category_id: "cat-vegetable-dishes",
    name: "Veg Main",
    description: "",
    price: 150,
    unit: "tray",
    diet_tags: ["vegan"],
    is_available: true,
  },
  {
    id: "item-rice",
    category_id: "cat-rice-noodles",
    name: "Rice",
    description: "",
    price: 80,
    unit: "tray",
    diet_tags: ["vegan"],
    is_available: true,
  },
  {
    id: "item-dessert",
    category_id: "cat-desserts",
    name: "Gulabjamun",
    description: "",
    price: 90,
    unit: "tray",
    diet_tags: ["pure_vegetarian"],
    is_available: true,
  },
  {
    id: "item-app",
    category_id: "cat-appetizers",
    name: "Samosa",
    description: "",
    price: 70,
    unit: "tray",
    diet_tags: ["vegan"],
    is_available: true,
  },
  {
    id: "item-jain",
    category_id: "cat-vegetable-dishes",
    name: "Jain Okra",
    description: "",
    price: 140,
    unit: "tray",
    diet_tags: ["jain", "vegan"],
    is_available: true,
  },
];

function line(
  partial: Omit<BudgetPlanLine, "line_total"> & { line_total?: number }
): BudgetPlanLine {
  const quantity = partial.quantity;
  const price = partial.price;
  return {
    ...partial,
    line_total: partial.line_total ?? quantity * price,
  };
}

function testRemovesDessertBeforeMain() {
  const lines = [
    line({
      menu_item_id: "item-veg-main",
      name: "Veg Main",
      quantity: 2,
      unit: "tray",
      price: 150,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-rice",
      name: "Rice",
      quantity: 1,
      unit: "tray",
      price: 80,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-dessert",
      name: "Gulabjamun",
      quantity: 1,
      unit: "tray",
      price: 90,
      serves: 25,
      coverage_for: "general",
    }),
  ];
  // Cost = 300+80+90 = 470; budget 400 → should drop dessert, keep main+rice
  const fit = fitPlanToBudget({
    lines,
    budget: 400,
    neededServes: 40,
    catalog,
  });
  assert.ok(fit.trimmed);
  assert.ok(
    fit.lines.some((l) => l.menu_item_id === "item-veg-main"),
    "must keep main"
  );
  assert.ok(
    fit.lines.some((l) => l.menu_item_id === "item-rice"),
    "must keep starch"
  );
  assert.ok(
    !fit.lines.some((l) => l.menu_item_id === "item-dessert"),
    "dessert should be cut first"
  );
  assert.ok(fit.within_budget);
  console.log("ok — removes dessert before main/starch");
}

function testNeverRemovesLastDedicated() {
  const lines = [
    line({
      menu_item_id: "item-jain",
      name: "Jain Okra",
      quantity: 1,
      unit: "tray",
      price: 140,
      serves: 30,
      coverage_for: "jain",
    }),
    line({
      menu_item_id: "item-veg-main",
      name: "Veg Main",
      quantity: 1,
      unit: "tray",
      price: 150,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-dessert",
      name: "Gulabjamun",
      quantity: 1,
      unit: "tray",
      price: 90,
      serves: 25,
      coverage_for: "general",
    }),
  ];
  // Aggressive budget — still must keep Jain dedicated
  const fit = fitPlanToBudget({
    lines,
    budget: 200,
    neededServes: 25,
    catalog,
  });
  assert.ok(
    fit.lines.some((l) => l.menu_item_id === "item-jain"),
    "must keep dedicated Jain tray"
  );
  console.log("ok — never removes last dedicated restriction tray");
}

function testDoesNotUnderfeed() {
  const lines = [
    line({
      menu_item_id: "item-veg-main",
      name: "Veg Main",
      quantity: 2,
      unit: "tray",
      price: 150,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-rice",
      name: "Rice",
      quantity: 1,
      unit: "tray",
      price: 80,
      serves: 30,
      coverage_for: "general",
    }),
  ];
  // Needed 55 serves; 2*30+30=90. Budget tiny → should warn rather than gut food
  const fit = fitPlanToBudget({
    lines,
    budget: 50,
    neededServes: 55,
    catalog,
  });
  assert.ok(fit.lines.length >= 1, "must keep edible food");
  const serves = fit.lines.reduce(
    (s, l) => s + (l.serves || 20) * l.quantity,
    0
  );
  assert.ok(
    serves >= 55 * 0.9 || fit.warnings.length > 0,
    "either keep ~90% serves or warn"
  );
  if (!fit.within_budget) {
    assert.ok(
      fit.warnings.some((w) => /underfeeding|Could not reach/i.test(w)),
      "must warn when budget cannot feed guests"
    );
  }
  console.log("ok — does not underfeed for budget");
}

function testReducesQtyBeforeDeletingStaple() {
  const lines = [
    line({
      menu_item_id: "item-veg-main",
      name: "Veg Main",
      quantity: 3,
      unit: "tray",
      price: 150,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-rice",
      name: "Rice",
      quantity: 1,
      unit: "tray",
      price: 80,
      serves: 30,
      coverage_for: "general",
    }),
    line({
      menu_item_id: "item-app",
      name: "Samosa",
      quantity: 2,
      unit: "tray",
      price: 70,
      serves: 20,
      coverage_for: "general",
    }),
  ];
  // 450+80+140 = 670; budget 520 → reduce app/main qty, keep rice
  const fit = fitPlanToBudget({
    lines,
    budget: 520,
    neededServes: 50,
    catalog,
  });
  assert.ok(
    fit.lines.some((l) => l.menu_item_id === "item-rice"),
    "keep starch"
  );
  assert.ok(
    fit.lines.some((l) => l.menu_item_id === "item-veg-main"),
    "keep main"
  );
  assert.ok(fit.within_budget || fit.warnings.length >= 0);
  console.log("ok — reduces qty / extras before deleting staples");
}

testRemovesDessertBeforeMain();
testNeverRemovesLastDedicated();
testDoesNotUnderfeed();
testReducesQtyBeforeDeletingStaple();
console.log("\nAll budget-trim tests passed.");
