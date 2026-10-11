import assert from "node:assert/strict";
import { menuItems } from "../data/menu-seed";
import { applyMemoryOps, emptyGuestMemory, type GuestEventMemory } from "./guest-memory";
import { buildPlan } from "./engine";
import { normalizeWishes, mergeWishes, emptyMenuWishes } from "./menu-wishes";
import { wishesFromMessages } from "./wish-lexicon";
import { courseOf, cuisineOf } from "./menu-templates";
import { chooseVariantAndQuantity } from "./portion-rules";

const catalog = menuItems;
const byId = (id: string) => catalog.find((i) => i.id === id)!;

function memoryWith(
  total: number,
  extra: {
    meal?: string;
    groups?: [string, number, string?][];
    kids?: number;
    wishes?: unknown;
    messages?: string[];
  } = {}
): GuestEventMemory {
  const m = emptyGuestMemory({ event_id: "t", session_id: "t", customer_email: "t@t" });
  const ops: Parameters<typeof applyMemoryOps>[1] = [
    { op: "update", path: "headcount", value: total },
    { op: "update", path: "event", key: "meal", value: extra.meal || "lunch" },
  ];
  for (const [kind, count, allergen] of extra.groups || []) {
    ops.push({
      op: "update",
      path: "requirement_groups",
      key: kind,
      value: allergen ? { count, allergen } : count,
    });
  }
  if (extra.kids) ops.push({ op: "update", path: "headcount.segments", key: "kids", value: extra.kids });
  if (extra.wishes) ops.push({ op: "update", path: "menu_wishes", value: extra.wishes });
  if (extra.messages) {
    const heard = wishesFromMessages(
      extra.messages.map((content) => ({ role: "user", content })),
      catalog
    );
    ops.push({ op: "update", path: "menu_wishes_heard", value: heard });
  }
  const res = applyMemoryOps(m, ops);
  assert.deepEqual(res.errors, [], `memory ops failed: ${res.errors.join("; ")}`);
  return res.memory;
}

const plan = (memory: GuestEventMemory) => buildPlan({ memory, catalog });
const courses = (p: ReturnType<typeof plan>) =>
  p.items.map((l) => courseOf(byId(l.menu_item_id)));

function testLexiconReadsPizzaAndJain() {
  const w = wishesFromMessages(
    [
      { role: "user", content: "Planning a birthday in Milpitas for 25 people, all Jain." },
      { role: "user", content: "We want pizzas for the kids" },
    ],
    catalog
  );
  assert.ok(w.cuisines.some((c) => c.id === "pizza"), "pizza wish heard");
  console.log("ok: lexicon hears pizzas");
}

function testLexiconNegationAndOnly() {
  const w = wishesFromMessages(
    [
      { role: "user", content: "Just appetizers please, nothing fried. No paneer." },
      { role: "user", content: "Is the samosa spicy?" },
    ],
    catalog
  );
  assert.deepEqual(w.courses_only, ["appetizer"]);
  assert.ok(w.exclude_terms.includes("fried"));
  assert.ok(w.exclude_terms.includes("paneer"));
  assert.ok(!w.spice_max, "questions are not wishes");
  console.log("ok: lexicon handles only / no / questions");
}

function testLexiconLaterWordingWins() {
  const w = wishesFromMessages(
    [
      { role: "user", content: "No rice please" },
      { role: "user", content: "Actually add rice back" },
    ],
    catalog
  );
  assert.ok(!w.courses_exclude.includes("starch"));
  assert.ok(w.courses_add.includes("starch"));
  console.log("ok: later wording overrides earlier");
}

function testMustHaveByName() {
  const w = wishesFromMessages([{ role: "user", content: "We must have palak paneer and no rice" }], catalog);
  assert.ok(w.must_have.length >= 1, "palak paneer heard as must-have");
  assert.ok(w.courses_exclude.includes("starch"));
  console.log("ok: must-have dish and course exclusion heard");
}

function testNoWishesKeepsIndianLunch() {
  const p = plan(memoryWith(30));
  assert.ok(p.items.length >= 4);
  assert.ok(!p.items.some((l) => byId(l.menu_item_id).category_id === "cat-pizzas"));
  assert.equal(p.honored, undefined, "no wishes → original engine");
  console.log("ok: no wishes → unchanged Indian lunch planner");
}

function testJainPizzaParty() {
  const p = plan(memoryWith(25, { groups: [["jain", 25]], messages: ["We want pizzas"] }));
  const pizzas = p.items.filter((l) => byId(l.menu_item_id).category_id === "cat-pizzas");
  assert.ok(pizzas.length >= 2, `expected pizza varieties, got ${p.items.map((l) => l.name).join(", ")}`);
  for (const l of p.items) {
    assert.ok(byId(l.menu_item_id).diet_tags.includes("jain"), `${l.name} must be Jain`);
  }
  const slices = pizzas.reduce((s, l) => s + l.quantity * 8, 0);
  assert.ok(slices >= 25 * 3, `enough slices for 25 guests (${slices})`);
  assert.ok(pizzas.every((l) => l.variant_id === "14"), "default 14-inch");
  assert.ok(p.lines[0].reason?.includes("slices"));
  assert.ok(p.honored?.some((h) => /pizza/i.test(h)));
  console.log("ok: Jain pizza party →", p.items.map((l) => `${l.quantity}× ${l.name}`).join(", "));
}

function testAddPizzasKeepsIndianMeal() {
  const messages = [
    "We're doing a team lunch for about 30 people",
    "Mostly pure vegetarian",
    "Sounds good, maybe add some pizzas too",
  ];
  const heard = wishesFromMessages(messages.map((content) => ({ role: "user", content })), catalog);
  assert.ok(heard.courses_add.includes("pizza"), "add cue → pizza course");
  assert.ok(!heard.cuisines.some((c) => c.id === "pizza"), "not a pizza cuisine");

  for (const wishes of [undefined, { cuisines: [{ id: "pizza", mode: "include" }] }]) {
    const p = plan(memoryWith(30, { messages, wishes }));
    const cs = courses(p);
    assert.ok(cs.includes("pizza"), `pizzas added: ${p.items.map((l) => l.name).join(", ")}`);
    assert.ok(cs.includes("main"), `Indian mains kept: ${p.items.map((l) => l.name).join(", ")}`);
    assert.ok(cs.includes("starch") || cs.includes("bread"), "rice or bread kept");
  }

  const plus = wishesFromMessages([{ role: "user", content: "Indian food plus pizzas" }], catalog);
  assert.ok(plus.courses_add.includes("pizza"), "'plus pizzas' adds a pizza course");
  console.log("ok: 'add some pizzas too' keeps the Indian meal");
}

function testOnlyPizzaSize() {
  const p = plan(
    memoryWith(20, { wishes: { cuisines: [{ id: "pizza", mode: "only" }], size_pref: { pizza: "12" } } })
  );
  assert.ok(p.items.length > 0);
  assert.ok(p.items.every((l) => byId(l.menu_item_id).category_id === "cat-pizzas"), "only pizzas");
  assert.ok(p.items.every((l) => l.variant_id === "12"), "12-inch honored");
  console.log("ok: only pizzas, 12-inch");
}

function testSnacksNoFried() {
  const p = plan(memoryWith(40, { meal: "snack", messages: ["Just appetizers, nothing fried"] }));
  assert.ok(p.items.length >= 2);
  for (const l of p.items) {
    const item = byId(l.menu_item_id);
    assert.equal(courseOf(item), "appetizer", `${l.name} should be an appetizer`);
    assert.ok(!/fried|pakora|samosa|vada|bhaji|poori|puri|kachori/i.test(`${item.name} ${item.description}`), `${l.name} fried`);
  }
  console.log("ok: snacks only, nothing fried →", p.items.map((l) => l.name).join(", "));
}

function testMustHaveNoRice() {
  const p = plan(memoryWith(30, { wishes: { must_have: [{ ref: "palak paneer" }], courses_exclude: ["starch"] } }));
  assert.ok(p.items.some((l) => /palak paneer/i.test(l.name)), "palak paneer included");
  assert.ok(!courses(p).includes("starch"), "no rice/noodles");
  console.log("ok: must-have palak paneer, no rice");
}

function testUnknownDishIsUnmet() {
  const p = plan(memoryWith(20, { wishes: { must_have: [{ ref: "lobster thermidor" }] } }));
  assert.ok(p.unmet?.some((u) => /lobster/i.test(u.wish)));
  assert.ok(p.notes.some((n) => n.startsWith("Could not do")));
  console.log("ok: unknown dish reported unmet");
}

function testPartialJainGetsDedicated() {
  const p = plan(memoryWith(40, { groups: [["jain", 6]], wishes: { cuisines: [{ id: "indo_chinese", mode: "include" }] } }));
  const jain = p.coverage.find((c) => c.group === "jain");
  assert.ok(jain?.ok, "Jain group covered");
  assert.ok(p.items.some((l) => cuisineOf(byId(l.menu_item_id)) === "indo_chinese"), "Indo-Chinese dish present");
  console.log("ok: Indo-Chinese menu with dedicated Jain dishes");
}

function testSwaminarayanFiltersWholeMenu() {
  const p = plan(memoryWith(30, { groups: [["swaminarayan", 30]] }));
  assert.ok(p.items.length >= 3);
  for (const l of p.items) assert.ok(byId(l.menu_item_id).diet_tags.includes("swaminarayan"), `${l.name}`);
  console.log("ok: whole-party Swaminarayan filter");
}

function testMildAndHearty() {
  const base = plan(memoryWith(30, { wishes: { spice_max: "mild" } }));
  const hearty = plan(memoryWith(30, { wishes: { spice_max: "mild", appetite: "hearty" } }));
  const serves = (p: typeof base) => p.items.reduce((s, l) => s + (l.serves || 0) * l.quantity, 0);
  assert.ok(serves(hearty) >= serves(base), "hearty does not shrink food");
  console.log("ok: mild + hearty");
}

function testPortionUnits() {
  const pizza = chooseVariantAndQuantity(byId("pizza-margherita"), 10, { course: "pizza", preferVariantId: "14" });
  assert.equal(pizza.variant?.id, "14");
  assert.equal(pizza.quantity, Math.ceil((10 * 1.1) / (8 / 3)));
  const piece = catalog.find((i) => i.unit === "piece" && i.category_id === "cat-appetizers");
  if (piece) {
    const r = chooseVariantAndQuantity(piece, 30, { course: "appetizer" });
    assert.ok(r.quantity >= 33, `catalog serves 1 per piece, plus buffer (${r.quantity})`);
  }
  console.log("ok: pizza and piece portions");
}

function testWishMergeOps() {
  let w = normalizeWishes({ courses_exclude: ["rice"] });
  assert.deepEqual(w.courses_exclude, ["starch"]);
  w = mergeWishes(w, normalizeWishes({ courses_add: ["starch"] }));
  assert.deepEqual(w.courses_exclude, []);
  const m = memoryWith(10, { wishes: { cuisines: ["pizza"] } });
  const res = applyMemoryOps(m, [{ op: "remove", path: "menu_wishes.cuisines", value: "pizza" }]);
  assert.deepEqual(res.memory.menu_wishes?.cuisines, []);
  assert.deepEqual(emptyMenuWishes().must_have, []);
  console.log("ok: wish ops merge and remove");
}

testLexiconReadsPizzaAndJain();
testLexiconNegationAndOnly();
testLexiconLaterWordingWins();
testMustHaveByName();
testNoWishesKeepsIndianLunch();
testJainPizzaParty();
testAddPizzasKeepsIndianMeal();
testOnlyPizzaSize();
testSnacksNoFried();
testMustHaveNoRice();
testUnknownDishIsUnmet();
testPartialJainGetsDedicated();
testSwaminarayanFiltersWholeMenu();
testMildAndHearty();
testPortionUnits();
testWishMergeOps();
console.log("\nAll menu-wishes tests passed.");
