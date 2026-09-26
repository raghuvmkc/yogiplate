/**
 * Sync Stone Craft order-app pizzas + images into Yogiplate catering catalog.
 * Source of truth: StoneCraftPizza/order-app/menu_data.py + static/menu-images/
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const scpRoot = path.join(root, "..", "StoneCraftPizza");
const imgSrc = path.join(scpRoot, "order-app", "static", "menu-images");
const imgDest = path.join(root, "public", "images", "menu", "pizzas");
const catalogPath = path.join(root, "src", "lib", "data", "catering-catalog.json");

const DEFAULT_SIZES = [
  { id: "10", label: '10"', price_cents: 2599 },
  { id: "12", label: '12"', price_cents: 2799 },
  { id: "14", label: '14"', price_cents: 2999 },
];

/** Exact catalog from Stone Craft order-app/menu_data.py */
const PIZZAS = [
  {
    id: "margherita",
    name: "Classic Margherita",
    desc: "Vine-ripened tomato, fresh basil, milky mozzarella — Italy's national pizza.",
    image: "embedded_34.jpg",
    tags: ["Italian"],
  },
  {
    id: "cheese",
    name: "Cheese Pizza",
    desc: "Stone-baked until edges blister and cheese pulls in long, golden strings.",
    image: "cheese_Pizza.jpg",
    tags: ["Italian"],
  },
  {
    id: "smoked_veggie",
    name: "Smoked Veggie Sauté",
    desc: "Smoked vegetables, olive oil, and Mediterranean herbs on hand-stretched dough.",
    image: "VeggiePizza.jpg",
    tags: ["Italian", "Signature"],
    sizes: [
      { id: "10", label: '10"', price_cents: 2699 },
      { id: "12", label: '12"', price_cents: 2899 },
      { id: "14", label: '14"', price_cents: 3099 },
    ],
  },
  {
    id: "artichoke_heart",
    name: "Artichoke Heart Sauté",
    desc: "Tender artichoke hearts kissed by olive oil and Tuscan herbs.",
    image: "Artichokes.jpg",
    tags: ["Italian"],
  },
  {
    id: "spinach_ricotta_stuffed",
    name: "Spinach & Ricotta Stuffed",
    desc: "Creamy ricotta and slow-cooked spinach folded inside, then baked on stone.",
    image: "Stuffed.jpg",
    tags: ["Signature"],
    sizes: [
      { id: "10", label: '10"', price_cents: 2799 },
      { id: "12", label: '12"', price_cents: 2999 },
      { id: "14", label: '14"', price_cents: 3199 },
    ],
  },
  {
    id: "chilli_paneer",
    name: "Chilli Paneer Pizza",
    desc: "Signature Indo-Chinese chilli glaze with paneer, bell peppers, and a chef's-secret kick.",
    image: "chilliPaneer.jpg",
    tags: ["Fusion", "Signature"],
    sizes: [
      { id: "10", label: '10"', price_cents: 2849 },
      { id: "12", label: '12"', price_cents: 3049 },
      { id: "14", label: '14"', price_cents: 3249 },
    ],
  },
  {
    id: "butter_corn",
    name: "Butter Corn Pizza",
    desc: "Sweet golden corn, melted butter, generous mozzarella — loved by everyone.",
    image: "Corn Pizza.jpg",
    tags: ["Fusion"],
  },
  {
    id: "pineapple_jalapeno",
    name: "Pineapple & Jalapeños",
    desc: "Fresh pineapple and the slow burn of jalapeño. Tropical thunder on crust.",
    image: "Pineapple.jpg",
    tags: ["Special"],
  },
  {
    id: "soya_chilli",
    name: "Soy Chilli — Plant-Powered",
    desc: "Fully plant-based chilli pizza with soya, roasted peppers, and fresh herbs.",
    image: "SoyPizza.jpg",
    tags: ["Vegan", "Fusion"],
    sizes: [
      { id: "10", label: '10"', price_cents: 2699 },
      { id: "12", label: '12"', price_cents: 2899 },
      { id: "14", label: '14"', price_cents: 3099 },
    ],
  },
];

function dietTagsFor(pizza) {
  const tags = new Set(["pure_vegetarian", "italian"]);
  const scTags = (pizza.tags || []).map((t) => t.toLowerCase());
  if (scTags.includes("vegan") || pizza.id === "soya_chilli") {
    tags.add("vegan");
    tags.add("jain");
    tags.add("swaminarayan");
    tags.add("pushtimarg");
  } else if (pizza.id === "chilli_paneer" || pizza.id === "smoked_veggie") {
    // often onion/garlic or mixed veg — pure veg + italian; prep notes cover specials
    tags.add("swaminarayan");
    tags.add("pushtimarg");
  } else {
    // Stone Craft offers Jain / Swaminarayan / Vegan prep on request for classics
    tags.add("jain");
    tags.add("swaminarayan");
    tags.add("pushtimarg");
  }
  return [...tags];
}

function money(cents) {
  return Math.round(cents) / 100;
}

if (!fs.existsSync(imgSrc)) {
  console.error("Stone Craft menu-images not found at", imgSrc);
  process.exit(1);
}

fs.mkdirSync(imgDest, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const nonPizza = catalog.items.filter((i) => i.category_id !== "cat-pizzas");
const pizzaItems = [];

for (const pz of PIZZAS) {
  const srcFile = path.join(imgSrc, pz.image);
  if (!fs.existsSync(srcFile)) {
    console.error("Missing image:", srcFile);
    process.exit(1);
  }
  const ext = path.extname(pz.image).toLowerCase() || ".jpg";
  const destName = `${pz.id}${ext}`;
  fs.copyFileSync(srcFile, path.join(imgDest, destName));
  console.log(`Copied ${pz.image} -> ${destName}`);

  const sizes = pz.sizes || DEFAULT_SIZES;
  const variants = sizes.map((s) => ({
    id: s.id,
    label: s.label,
    price: money(s.price_cents),
    unit: "pizza",
  }));

  pizzaItems.push({
    id: `pizza-${pz.id}`,
    category_id: "cat-pizzas",
    name: pz.name,
    description: `${pz.desc} From Stone Craft Pizza.`,
    price: variants[0].price,
    unit: "pizza",
    diet_tags: dietTagsFor(pz),
    is_available: true,
    variants,
    notes:
      "Stone Craft Pizza — Jain / Swaminarayan / Vegan prep available on request.",
    image: `/images/menu/pizzas/${destName}`,
  });
}

// Keep category label clear
const cat = catalog.categories.find((c) => c.id === "cat-pizzas");
if (cat) cat.name = "Pizzas (Stone Craft)";

catalog.items = [...nonPizza, ...pizzaItems];
// packages were after pizzas originally — ensure packages stay at end
const pkgs = catalog.items.filter((i) => i.category_id === "cat-packages");
const rest = catalog.items.filter((i) => i.category_id !== "cat-packages");
const pizzas = rest.filter((i) => i.category_id === "cat-pizzas");
const before = rest.filter((i) => i.category_id !== "cat-pizzas");
catalog.items = [...before, ...pizzas, ...pkgs];

catalog.seedVersion = "catering-v8-stonecraft-pizzas";
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");

console.log(`Synced ${pizzaItems.length} Stone Craft pizzas`);
pizzaItems.forEach((p) =>
  console.log(`  ${p.name} | ${p.image} | from $${p.price}`)
);
