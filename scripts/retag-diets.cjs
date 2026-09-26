/**
 * Retag catering items with authentic multi-diet eligibility.
 * Items may appear under several diets when they qualify.
 */
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

/** Explicit overrides by item id. Arrays are the full diet_tags set. */
const OVERRIDES = {
  // —— Appetizers ——
  "item-mix-veg-pakoras": ["pure_vegetarian", "swaminarayan", "pushtimarg"], // often potato
  "item-chili-paneer": ["pure_vegetarian", "italian"], // onion/garlic Indo-Chinese; dairy
  "item-pani-pooris": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-dahi-vada": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-mumbai-bhaji": ["pure_vegetarian"], // potato + typically onion
  "item-urad-vadas": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-idlis": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-cauliflower-manchurian": ["pure_vegetarian"], // onion/garlic
  "item-paneer-tikka-skewers": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "item-samosa": ["pure_vegetarian"], // potato

  // —— Salads ——
  "item-italian-green-salad-with-dressing": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-greek-salad": ["pure_vegetarian", "swaminarayan", "pushtimarg", "italian"], // feta dairy; onion often — Swami/Pushti if no onion prep
  "item-mozzarella-caprese": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "item-lemon-orzo-pasta-salad-with-peas-and-mint": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-arugula-and-tomatoes-salad": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],

  // —— Vegetable dishes ——
  "item-alu-gobi": ["pure_vegetarian", "swaminarayan", "pushtimarg"], // potato — not Jain
  "item-okra-stir-fry": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-smoky-paneer-makhni": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-paneer-tikka-masala-gravy": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-chili-paneer-gravy": ["pure_vegetarian"],
  "item-methi-malai-matar": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-alu-methi": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-navaratna-koorma": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-palak-paneer": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-eggplants-and-paneer-in-fresh-tomato-sauce": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "item-veg-pahadi": ["pure_vegetarian", "swaminarayan", "pushtimarg", "vegan"],
  "item-thai-green-curry": ["pure_vegetarian", "vegan"],
  "item-malai-kofta": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-amritsari-chole": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-chickpeas-with-spinach": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-tofu-crumbles-with-veggies": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],

  // —— Dal & soups ——
  "item-toordal-tadka": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-whole-moongdal-with-moringa": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-roasted-moonddal-with-fried-potatoes": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-dal-makhni": ["pure_vegetarian", "swaminarayan", "pushtimarg"], // butter/cream
  "item-rajma": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-veg-manchow-soup": ["pure_vegetarian", "vegan"],
  "item-wanton-soup": ["pure_vegetarian", "vegan"],
  "item-tuardal-khatta-mitha": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],

  // —— Rice & noodles ——
  "item-vegetable-biryani": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-vegetable-pulao": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-peas-pulao": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-cumin-cilantro-rice": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-risotto": ["pure_vegetarian", "swaminarayan", "pushtimarg", "italian"], // dairy risotto typical
  "item-chinese-fried-rice": ["pure_vegetarian", "vegan"],
  "item-thai-jasmine-rice": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-italian-vegetable-rice": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-vegetable-khichri": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-chowmein-chinese-fried-noodles": ["pure_vegetarian", "vegan"],
  "item-thai-pad-noodles": ["pure_vegetarian", "vegan"],

  // —— Breads ——
  "item-whole-wheat-rotis-with-ghee": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ], // ghee — not vegan

  // —— Desserts (dairy) ——
  "item-pineapple-halwa": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-brown-rassogullas": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-malai-chum-chum": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-ras-malai": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-chena-rabri": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-srikhand": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-kesari-sweet-rice": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-gulabjamun": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-kalajamun": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],
  "item-fruit-custard": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
  ],

  // —— Condiments ——
  "item-coconut-celey-chutney": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-pineapple-chutney": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],
  "item-dates-raisin-chutney": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
  ],

  // —— Pastas / Italian trays ——
  "item-vegatable-lasanga": ["pure_vegetarian", "italian"], // cheese
  "item-pasta-in-marinara-sauce": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-eggplants-and-tofu-in-fresh-basil-tomato-sauce": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-minestrone-soup": [
    "pure_vegetarian",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ], // often has onion — not Jain default
  "item-yogiplate-special-pumpkin-basil-soup": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],

  // —— Sides ——
  "item-poori": ["pure_vegetarian", "jain", "swaminarayan", "pushtimarg", "vegan"],
  "item-bhatura": ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  "item-focaccia-bread": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
  "item-pav": ["pure_vegetarian", "swaminarayan", "pushtimarg", "vegan"],
  "item-buttered-masala-pav": ["pure_vegetarian"], // butter + masala onion likely

  // —— Pizzas (Stone Craft: Jain / Swaminarayan / Vegan prep on request) ——
  "pizza-margherita": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-cheese": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-smoked_veggie": ["pure_vegetarian", "swaminarayan", "pushtimarg", "italian"],
  "pizza-artichoke_heart": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-spinach_ricotta_stuffed": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-chilli_paneer": ["pure_vegetarian", "italian"],
  "pizza-butter_corn": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-pineapple_jalapeno": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "italian",
  ],
  "pizza-soya_chilli": [
    "pure_vegetarian",
    "jain",
    "swaminarayan",
    "pushtimarg",
    "vegan",
    "italian",
  ],
};

let updated = 0;
const missing = [];
for (const item of j.items) {
  if (item.category_id === "cat-packages") continue;
  if (OVERRIDES[item.id]) {
    item.diet_tags = OVERRIDES[item.id];
    updated++;
  } else {
    missing.push(item.id + " " + item.name);
  }
}

j.seedVersion = "catering-v6-diet-segregation";
fs.writeFileSync(catalogPath, JSON.stringify(j, null, 2), "utf8");
console.log(`Retagged ${updated} items`);
if (missing.length) {
  console.log("No override for:");
  missing.forEach((m) => console.log(" ", m));
}

// Summary counts per diet
for (const d of ["jain", "swaminarayan", "pushtimarg", "vegan", "italian"]) {
  const n = j.items.filter(
    (i) => i.is_available && i.diet_tags.includes(d) && i.category_id !== "cat-packages"
  ).length;
  console.log(`${d}: ${n} items`);
}
