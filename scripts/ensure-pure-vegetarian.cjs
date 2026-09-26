const fs = require("fs");
const path = require("path");

const catalogPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "data",
  "catering-catalog.json"
);
const j = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

let added = 0;
for (const item of j.items) {
  if (item.category_id === "cat-packages") continue;
  if (!Array.isArray(item.diet_tags)) item.diet_tags = [];
  if (!item.diet_tags.includes("pure_vegetarian")) {
    item.diet_tags = ["pure_vegetarian", ...item.diet_tags];
    added++;
  }
}

j.seedVersion = "catering-v7-pure-vegetarian-all";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");

const pureCount = j.items.filter(
  (i) =>
    i.category_id !== "cat-packages" &&
    i.diet_tags.includes("pure_vegetarian")
).length;
const total = j.items.filter((i) => i.category_id !== "cat-packages").length;
console.log(`Added pure_vegetarian to ${added} items`);
console.log(`Pure vegetarian coverage: ${pureCount}/${total}`);
