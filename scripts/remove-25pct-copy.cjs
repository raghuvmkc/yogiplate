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

for (const item of j.items) {
  if (typeof item.description === "string" && /25%/i.test(item.description)) {
    item.description = "Catering dessert tray.";
  }
  if (typeof item.notes === "string" && /25%/i.test(item.notes)) {
    delete item.notes;
  }
}

j.seedVersion = "catering-v5-no-25pct-copy";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");
console.log(
  "25% left:",
  JSON.stringify(j).includes("25%"),
  "dessert notes sample:",
  j.items.find((i) => i.category_id === "cat-desserts")?.notes
);
