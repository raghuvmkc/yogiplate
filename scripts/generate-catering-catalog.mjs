import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TRAY_MAP = [
  ["medium_serve_price", "half", "Half tray"],
  ["large_serve_price", "medium", "Medium tray"],
  ["extra_large_serve_price", "full", "Full tray"],
];

const CATEGORY_META = [
  {
    slug: "appetizers",
    id: "cat-appetizers",
    name: "Appetizers",
    sort: 1,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  },
  {
    slug: "salads",
    id: "cat-salads",
    name: "Salads",
    sort: 2,
    diets: ["pure_vegetarian", "italian", "vegan"],
  },
  {
    slug: "vegetable-dishes",
    id: "cat-vegetable-dishes",
    name: "Vegetable Dishes",
    sort: 3,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  },
  {
    slug: "dal-soups",
    id: "cat-dal-soups",
    name: "Dal & Soups",
    sort: 4,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg", "vegan"],
  },
  {
    slug: "rice-noodles",
    id: "cat-rice-noodles",
    name: "Rice & Noodles",
    sort: 5,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg", "vegan"],
  },
  {
    slug: "breads-rotis",
    id: "cat-breads-rotis",
    name: "Breads / Rotis",
    sort: 6,
    diets: ["pure_vegetarian", "jain", "swaminarayan", "pushtimarg", "vegan"],
  },
  {
    slug: "desserts",
    id: "cat-desserts",
    name: "Desserts",
    sort: 7,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  },
  {
    slug: "condiments-chutneys",
    id: "cat-condiments",
    name: "Condiments / Chutneys",
    sort: 8,
    diets: ["pure_vegetarian", "jain", "swaminarayan", "pushtimarg", "vegan"],
  },
  {
    slug: "pastas",
    id: "cat-pastas",
    name: "Pastas",
    sort: 9,
    diets: ["pure_vegetarian", "italian"],
  },
  {
    slug: "sides",
    id: "cat-sides",
    name: "Sides",
    sort: 10,
    diets: ["pure_vegetarian", "swaminarayan", "pushtimarg"],
  },
];

function money(n) {
  return Math.round(n * 100) / 100;
}

function bumpSweet(n) {
  return money(n * 1.25);
}

const DEFAULT_SIZES = [
  { id: "10", label: '10"', price: 25.99 },
  { id: "12", label: '12"', price: 27.99 },
  { id: "14", label: '14"', price: 29.99 },
];

const STONECRAFT_PIZZAS = [
  {
    id: "margherita",
    name: "Classic Margherita",
    desc: "Vine-ripened tomato, fresh basil, milky mozzarella — Italy's national pizza.",
    tags: ["italian", "pure_vegetarian"],
    sizes: null,
  },
  {
    id: "cheese",
    name: "Cheese Pizza",
    desc: "Stone-baked until edges blister and cheese pulls in long, golden strings.",
    tags: ["italian", "pure_vegetarian"],
    sizes: null,
  },
  {
    id: "smoked_veggie",
    name: "Smoked Veggie Sauté",
    desc: "Smoked vegetables, olive oil, and Mediterranean herbs on hand-stretched dough.",
    tags: ["italian", "pure_vegetarian"],
    sizes: [
      { id: "10", label: '10"', price: 26.99 },
      { id: "12", label: '12"', price: 28.99 },
      { id: "14", label: '14"', price: 30.99 },
    ],
  },
  {
    id: "artichoke_heart",
    name: "Artichoke Heart Sauté",
    desc: "Tender artichoke hearts kissed by olive oil and Tuscan herbs.",
    tags: ["italian", "pure_vegetarian"],
    sizes: null,
  },
  {
    id: "spinach_ricotta_stuffed",
    name: "Spinach and Ricotta Stuffed",
    desc: "Creamy ricotta and slow-cooked spinach folded inside, then baked on stone.",
    tags: ["italian", "pure_vegetarian"],
    sizes: [
      { id: "10", label: '10"', price: 27.99 },
      { id: "12", label: '12"', price: 29.99 },
      { id: "14", label: '14"', price: 31.99 },
    ],
  },
  {
    id: "chilli_paneer",
    name: "Chilli Paneer Pizza",
    desc: "Signature Indo-Chinese chilli glaze with paneer, bell peppers, and a chef's-secret kick.",
    tags: ["italian", "pure_vegetarian"],
    sizes: [
      { id: "10", label: '10"', price: 28.49 },
      { id: "12", label: '12"', price: 30.49 },
      { id: "14", label: '14"', price: 32.49 },
    ],
  },
  {
    id: "butter_corn",
    name: "Butter Corn Pizza",
    desc: "Sweet golden corn, melted butter, generous mozzarella — loved by everyone.",
    tags: ["italian", "pure_vegetarian"],
    sizes: null,
  },
  {
    id: "pineapple_jalapeno",
    name: "Pineapple and Jalapeños",
    desc: "Fresh pineapple and the slow burn of jalapeño. Tropical thunder on crust.",
    tags: ["italian", "pure_vegetarian"],
    sizes: null,
  },
  {
    id: "soya_chilli",
    name: "Soy Chilli — Plant-Powered",
    desc: "Fully plant-based chilli pizza with soya, roasted peppers, and fresh herbs.",
    tags: ["italian", "pure_vegetarian", "vegan"],
    sizes: [
      { id: "10", label: '10"', price: 26.99 },
      { id: "12", label: '12"', price: 28.99 },
      { id: "14", label: '14"', price: 30.99 },
    ],
  },
];

const packages = [
  {
    id: "pkg-jain-25",
    name: "Jain Celebration Package",
    desc: "Starter, two mains, dal, rice, roti, salad, and sweet — fully Jain.",
    price: 22,
    diet: "jain",
  },
  {
    id: "pkg-swami-25",
    name: "Swaminarayan Feast Package",
    desc: "Sattvic full menu with starters, curries, breads, rice, and dessert.",
    price: 20,
    diet: "swaminarayan",
  },
  {
    id: "pkg-pushti-25",
    name: "Pushtimarg Seva Package",
    desc: "Pure vegetarian thali-style catering for seva and gatherings.",
    price: 21,
    diet: "pushtimarg",
  },
  {
    id: "pkg-vegan-25",
    name: "Bay Area Vegan Package",
    desc: "Completely plant-based menu with bold flavor and fresh produce.",
    price: 23,
    diet: "vegan",
  },
  {
    id: "pkg-pureveg-25",
    name: "Pure Vegetarian Feast Package",
    desc: "Starters, curries, breads, rice, and dessert — classic Indian vegetarian for every celebration.",
    price: 20,
    diet: "pure_vegetarian",
  },
  {
    id: "pkg-italian-25",
    name: "Italian Vegetarian Package",
    desc: "Pasta, salad, bread, and dessert — elegant for mixed gatherings.",
    price: 24,
    diet: "italian",
  },
];

const items = [];
const categories = CATEGORY_META.map((c) => ({
  id: c.id,
  name: c.name,
  sort_order: c.sort,
}));
categories.push({
  id: "cat-pizzas",
  name: "Pizzas (Stone Craft)",
  sort_order: 11,
});
categories.push({
  id: "cat-packages",
  name: "Catering Packages",
  sort_order: 12,
});

for (const meta of CATEGORY_META) {
  const res = await fetch(
    `https://admin.yogiplate.com/api/catering-menu/categories/${meta.slug}`
  );
  const data = await res.json();
  const list = data.result?.items || [];
  const isSweet = meta.slug === "desserts";

  for (const raw of list) {
    const title = raw.dish_item?.title || raw.slug;
    const slug = raw.slug || String(raw.id);
    const variants = [];

    for (const [field, vid, label] of TRAY_MAP) {
      let p = parseFloat(raw[field]);
      if (!Number.isFinite(p) || p <= 1) continue;
      if (isSweet) p = bumpSweet(p);
      variants.push({
        id: vid,
        label,
        price: money(p),
        unit: label.toLowerCase(),
      });
    }

    if (!variants.length) continue;

    const base = variants[0];
    const desc = String(
      raw.description || raw.dish_item?.description || ""
    ).trim();

    items.push({
      id: `item-${slug}`,
      category_id: meta.id,
      name: title,
      description:
        desc ||
        (isSweet
          ? "Catering dessert tray — sweet menu prices include a 25% increase."
          : "Catering tray pricing from the YogiPlate catering menu."),
      price: base.price,
      unit: "tray",
      diet_tags: meta.diets,
      is_available: true,
      variants,
      ...(isSweet
        ? { notes: "Sweet menu prices increased by 25%." }
        : {}),
    });
  }
}

for (const pz of STONECRAFT_PIZZAS) {
  const sizes = pz.sizes || DEFAULT_SIZES;
  const variants = sizes.map((s) => ({
    id: s.id,
    label: s.label,
    price: s.price,
    unit: "pizza",
  }));
  items.push({
    id: `pizza-${pz.id}`,
    category_id: "cat-pizzas",
    name: pz.name,
    description: `${pz.desc} From Stone Craft Pizza.`,
    price: variants[0].price,
    unit: "pizza",
    diet_tags: pz.tags,
    is_available: true,
    variants,
    notes:
      "Stone Craft Pizza — Jain / Swaminarayan / Vegan prep available on request.",
  });
}

for (const p of packages) {
  items.push({
    id: p.id,
    category_id: "cat-packages",
    name: p.name,
    description: p.desc,
    price: p.price,
    unit: "per guest",
    diet_tags: [p.diet],
    is_available: true,
    min_quantity: 25,
  });
}

const outPath = path.join(root, "src", "lib", "data", "catering-catalog.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    { seedVersion: "catering-v2-stonecraft", categories, items },
    null,
    2
  )
);

console.log(
  `Wrote ${outPath} — ${categories.length} categories, ${items.length} items`
);
console.log(
  "Desserts:",
  items
    .filter((i) => i.category_id === "cat-desserts")
    .map((d) => `${d.name}: ${d.variants.map((v) => `${v.label}=$${v.price}`).join(", ")}`)
    .join("\n")
);
