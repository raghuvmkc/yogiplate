import assert from "node:assert/strict";
import {
  matchFamousCombinations,
  pickBestCombo,
} from "./famous-combinations";

function testChaatPair() {
  const m = matchFamousCombinations({
    item_ids: ["item-pani-pooris"],
    limit: 5,
  });
  assert.ok(m.length >= 1);
  assert.ok(
    m.some((x) => x.combo.item_ids.includes("item-dahi-vada")),
    "pani poori should suggest dahi vada pairing"
  );
  console.log("ok — pani poori ↔ dahi vada famous pair");
}

function testPooriCompletesToChole() {
  const combo = pickBestCombo({
    catalogIds: new Set([
      "item-poori",
      "item-amritsari-chole",
      "item-alu-gobi",
      "item-cumin-cilantro-rice",
    ]),
    item_ids: ["item-poori"],
    hints: ["indian", "lunch"],
  });
  assert.ok(combo);
  assert.ok(
    combo!.item_ids.includes("item-amritsari-chole") ||
      combo!.item_ids.includes("item-alu-gobi"),
    "poori should complete to chole or alu"
  );
  console.log("ok — poori completes to famous main");
}

function testNotAppetizerOnlyDefault() {
  const combo = pickBestCombo({
    catalogIds: new Set([
      "item-mix-veg-pakoras",
      "item-chili-paneer",
      "item-pani-pooris",
      "item-dahi-vada",
      "item-palak-paneer",
      "item-whole-wheat-rotis-with-ghee",
      "item-vegetable-pulao",
      "item-toordal-tadka",
    ]),
    hints: ["indian", "dinner", "buffet"],
  });
  assert.ok(combo);
  const hasMainOrDal = combo!.roles.some((r) =>
    ["main", "dal", "starch", "bread"].includes(r)
  );
  assert.ok(hasMainOrDal, "default dinner combo must include a real meal role");
  console.log("ok — default dinner combo is not appetizer-only");
}

testChaatPair();
testPooriCompletesToChole();
testNotAppetizerOnlyDefault();
console.log("\nAll famous-combination tests passed.");
