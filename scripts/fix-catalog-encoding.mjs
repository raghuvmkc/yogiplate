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

const nameFixes = {
  "pizza-smoked_veggie": "Smoked Veggie Sauté",
  "pizza-artichoke_heart": "Artichoke Heart Sauté",
  "pizza-pineapple_jalapeno": "Pineapple and Jalapeños",
  "pizza-soya_chilli": "Soy Chilli — Plant-Powered",
};

for (const item of j.items) {
  if (nameFixes[item.id]) item.name = nameFixes[item.id];
  // strip accidental UTF-8 mojibake patterns in descriptions if present
  if (typeof item.description === "string") {
    item.description = item.description
      .replace(/Ã©/g, "é")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã¢â‚¬â€/g, "—")
      .replace(/â€™/g, "'")
      .replace(/â€”/g, "—");
  }
  if (typeof item.name === "string") {
    item.name = item.name
      .replace(/Ã©/g, "é")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã¢â‚¬â€/g, "—")
      .replace(/â€™/g, "'")
      .replace(/â€”/g, "—");
  }
}

j.seedVersion = "catering-v3-images";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");

const withImages = j.items.filter((i) => i.image).length;
console.log(`Fixed catalog. Images: ${withImages}/${j.items.length}`);
for (const id of Object.keys(nameFixes)) {
  const item = j.items.find((i) => i.id === id);
  console.log(id, "->", item?.name, item?.image);
}
