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

const fixes = {
  "pizza-smoked_veggie": {
    name: "Smoked Veggie Sauté",
    description:
      "Smoked vegetables, olive oil, and Mediterranean herbs on hand-stretched dough. From Stone Craft Pizza.",
  },
  "pizza-artichoke_heart": {
    name: "Artichoke Heart Sauté",
    description:
      "Tender artichoke hearts kissed by olive oil and Tuscan herbs. From Stone Craft Pizza.",
  },
  "pizza-pineapple_jalapeno": {
    name: "Pineapple and Jalapeños",
    description:
      "Fresh pineapple and the slow burn of jalapeño. Tropical thunder on crust. From Stone Craft Pizza.",
  },
  "pizza-soya_chilli": {
    name: "Soy Chilli — Plant-Powered",
    description:
      "Fully plant-based chilli pizza with soya, roasted peppers, and fresh herbs. From Stone Craft Pizza.",
  },
};

for (const item of j.items) {
  const f = fixes[item.id];
  if (f) {
    item.name = f.name;
    item.description = f.description;
  }
}

j.seedVersion = "catering-v3-images";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");
console.log("ok");
