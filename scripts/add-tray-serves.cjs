/**
 * Tray guest counts from YogiplateKT CateringPricing.vue:
 * Small Serves 20 | Medium Serves 30 | Large Serves 40
 *
 * Current catering UI maps those three tiers to Half / Medium / Full trays.
 */
const fs = require("fs");
const path = require("path");

const TRAY_SERVES = {
  half: 20,
  medium: 30,
  full: 40,
};

const catalogPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "data",
  "catering-catalog.json"
);
const j = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

let updated = 0;
for (const item of j.items) {
  if (!Array.isArray(item.variants)) continue;
  for (const v of item.variants) {
    if (v.id in TRAY_SERVES) {
      v.serves = TRAY_SERVES[v.id];
      updated++;
    }
  }
}

j.seedVersion = "catering-v4-tray-serves";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");
console.log(`Added serves to ${updated} tray variants`);
