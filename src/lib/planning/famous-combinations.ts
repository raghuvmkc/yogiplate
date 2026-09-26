/**
 * Classic catering combinations from the real Yogiplate catalog.
 * Agent and build_plan must use these — never invent pairings or items.
 */

export type ComboRole =
  | "appetizer"
  | "chaat"
  | "main"
  | "dal"
  | "starch"
  | "bread"
  | "salad"
  | "dessert"
  | "soup"
  | "pizza"
  | "side";

export type FamousCombination = {
  id: string;
  name: string;
  /** Why guests love this pairing (for warm agent storytelling). */
  why: string;
  /** Occasion / diet hints for matching */
  tags: string[];
  /** Ordered item ids that exist in catering-catalog.json */
  item_ids: string[];
  /** Roles corresponding to item_ids (same length) */
  roles: ComboRole[];
};

export const FAMOUS_COMBINATIONS: FamousCombination[] = [
  {
    id: "chaat-duo",
    name: "Chaat favorites",
    why: "Pani poori and dahi vada are a classic chaat pair guests expect together.",
    tags: ["appetizer", "party", "standing", "indian"],
    item_ids: ["item-pani-pooris", "item-dahi-vada"],
    roles: ["chaat", "chaat"],
  },
  {
    id: "chaat-spread",
    name: "Chaat + crispy starter",
    why: "Chaat with pakoras or samosas makes a lively appetizer round.",
    tags: ["appetizer", "party", "indian"],
    item_ids: ["item-pani-pooris", "item-dahi-vada", "item-mix-veg-pakoras"],
    roles: ["chaat", "chaat", "appetizer"],
  },
  {
    id: "chole-bhature",
    name: "Chole Bhature",
    why: "Amritsari chole with bhatura is a famous North Indian comfort combo.",
    tags: ["lunch", "dinner", "indian", "crowd"],
    item_ids: ["item-amritsari-chole", "item-bhatura"],
    roles: ["main", "bread"],
  },
  {
    id: "pav-bhaji",
    name: "Pav Bhaji",
    why: "Mumbai bhaji with pav is a street-food classic people light up for.",
    tags: ["lunch", "party", "indian", "standing"],
    item_ids: ["item-mumbai-bhaji", "item-pav"],
    roles: ["main", "bread"],
  },
  {
    id: "pav-bhaji-butter",
    name: "Butter masala pav bhaji",
    why: "Bhaji with buttered masala pav is a richer take on the same famous pair.",
    tags: ["dinner", "party", "indian"],
    item_ids: ["item-mumbai-bhaji", "item-buttered-masala-pav"],
    roles: ["main", "bread"],
  },
  {
    id: "poori-chole",
    name: "Poori Chole",
    why: "Poori with chole is a festive Indian meal guests recognize instantly.",
    tags: ["lunch", "dinner", "indian", "festival"],
    item_ids: ["item-poori", "item-amritsari-chole"],
    roles: ["bread", "main"],
  },
  {
    id: "poori-alu",
    name: "Poori with alu",
    why: "Poori with alu gobi or dry potato-style veg is a beloved home-style plate.",
    tags: ["lunch", "indian", "family"],
    item_ids: ["item-poori", "item-alu-gobi"],
    roles: ["bread", "main"],
  },
  {
    id: "south-tiffin",
    name: "Idli Vada",
    why: "Idlis and urad vadas with chutney are a famous South Indian breakfast/tiffin set.",
    tags: ["brunch", "lunch", "mild", "kids", "indian"],
    item_ids: ["item-idlis", "item-urad-vadas", "item-coconut-celey-chutney"],
    roles: ["appetizer", "appetizer", "side"],
  },
  {
    id: "rajma-chawal",
    name: "Rajma Chawal",
    why: "Rajma with rice is one of the most loved everyday Indian combinations.",
    tags: ["lunch", "dinner", "indian", "comfort", "vegan"],
    item_ids: ["item-rajma", "item-cumin-cilantro-rice"],
    roles: ["dal", "starch"],
  },
  {
    id: "dal-roti-sabzi",
    name: "Dal, roti & sabzi",
    why: "Dal tadka, rotis, and a vegetable tray is the classic balanced thali core.",
    tags: ["lunch", "dinner", "indian", "family", "buffet"],
    item_ids: [
      "item-toordal-tadka",
      "item-whole-wheat-rotis-with-ghee",
      "item-alu-gobi",
    ],
    roles: ["dal", "bread", "main"],
  },
  {
    id: "paneer-roti-rice",
    name: "Paneer with roti & rice",
    why: "A paneer main with rotis and rice is a crowd-pleasing full plate.",
    tags: ["dinner", "indian", "celebration", "crowd"],
    item_ids: [
      "item-palak-paneer",
      "item-whole-wheat-rotis-with-ghee",
      "item-vegetable-pulao",
    ],
    roles: ["main", "bread", "starch"],
  },
  {
    id: "makhni-roti",
    name: "Smoky paneer makhni plate",
    why: "Paneer makhni with roti (and rice) is a rich dinner favorite.",
    tags: ["dinner", "indian", "celebration"],
    item_ids: [
      "item-smoky-paneer-makhni",
      "item-whole-wheat-rotis-with-ghee",
      "item-cumin-cilantro-rice",
    ],
    roles: ["main", "bread", "starch"],
  },
  {
    id: "chole-rice-roti",
    name: "Chole rice plate",
    why: "Chole with rice and roti covers both spoon and scoop eaters.",
    tags: ["lunch", "dinner", "indian", "vegan"],
    item_ids: [
      "item-amritsari-chole",
      "item-cumin-cilantro-rice",
      "item-whole-wheat-rotis-with-ghee",
    ],
    roles: ["main", "starch", "bread"],
  },
  {
    id: "biryani-spread",
    name: "Biryani celebration",
    why: "Vegetable biryani as the star with a cooling salad and sweet finish feels festive.",
    tags: ["dinner", "celebration", "indian"],
    item_ids: [
      "item-vegetable-biryani",
      "item-arugula-and-tomatoes-salad",
      "item-gulabjamun",
    ],
    roles: ["starch", "salad", "dessert"],
  },
  {
    id: "indo-chinese",
    name: "Indo-Chinese night",
    why: "Chili paneer with Manchurian and fried rice/noodles is a famous party set.",
    tags: ["dinner", "party", "indo-chinese"],
    item_ids: [
      "item-chili-paneer",
      "item-cauliflower-manchurian",
      "item-chinese-fried-rice",
    ],
    roles: ["appetizer", "appetizer", "starch"],
  },
  {
    id: "soup-poori",
    name: "Soup & poori",
    why: "Yogiplate pumpkin basil soup with poori is a house pairing many guests already love.",
    tags: ["lunch", "starter", "indian"],
    item_ids: ["item-yogiplate-special-pumpkin-basil-soup", "item-poori"],
    roles: ["soup", "bread"],
  },
  {
    id: "stone-craft-pizza",
    name: "Stone Craft pizza night",
    why: "Margherita and cheese pizzas with a fresh salad is a classic Stone Craft combo.",
    tags: ["dinner", "kids", "italian", "pizza", "party"],
    item_ids: [
      "pizza-margherita",
      "pizza-cheese",
      "item-italian-green-salad-with-dressing",
    ],
    roles: ["pizza", "pizza", "salad"],
  },
  {
    id: "italian-pasta",
    name: "Pasta & focaccia",
    why: "Marinara pasta with focaccia and salad is a familiar Italian catering plate.",
    tags: ["lunch", "dinner", "italian"],
    item_ids: [
      "item-pasta-in-marinara-sauce",
      "item-focaccia-bread",
      "item-arugula-and-tomatoes-salad",
    ],
    roles: ["main", "bread", "salad"],
  },
  {
    id: "vegan-spinach-chole",
    name: "Vegan spinach & chole",
    why: "Chickpeas with spinach plus chole and rice makes a hearty vegan-friendly spread.",
    tags: ["vegan", "lunch", "dinner", "indian"],
    item_ids: [
      "item-chickpeas-with-spinach",
      "item-amritsari-chole",
      "item-cumin-cilantro-rice",
    ],
    roles: ["main", "main", "starch"],
  },
  {
    id: "jain-friendly-core",
    name: "Jain-friendly sabzi plate",
    why: "Okra stir fry with dal and rice is a clean, satisfying Jain-friendly core when tagged items allow.",
    tags: ["jain", "lunch", "dinner"],
    item_ids: [
      "item-okra-stir-fry",
      "item-toordal-tadka",
      "item-cumin-cilantro-rice",
    ],
    roles: ["main", "dal", "starch"],
  },
  {
    id: "sweet-finish",
    name: "Gulabjamun finish",
    why: "Gulabjamun is the classic sweet close after a savory Indian meal.",
    tags: ["dessert", "celebration", "indian"],
    item_ids: ["item-gulabjamun"],
    roles: ["dessert"],
  },
];

export type ComboMatch = {
  combo: FamousCombination;
  score: number;
  available_ids: string[];
};

function tagHit(combo: FamousCombination, hints: string[]): number {
  if (!hints.length) return 0;
  let score = 0;
  for (const t of combo.tags) {
    if (hints.some((h) => h === t || h.includes(t) || t.includes(h))) score += 2;
  }
  return score;
}

/** Score combinations that include any of the given item ids (e.g. cart starters). */
export function matchFamousCombinations(input: {
  item_ids?: string[];
  /** e.g. vegan, jain, italian, pizza, lunch, party */
  hints?: string[];
  limit?: number;
}): ComboMatch[] {
  const want = new Set((input.item_ids || []).filter(Boolean));
  const hints = (input.hints || []).map((h) => h.toLowerCase().trim());
  const limit = input.limit ?? 8;

  const scored: ComboMatch[] = [];
  for (const combo of FAMOUS_COMBINATIONS) {
    const available_ids = combo.item_ids.slice();
    let score = tagHit(combo, hints);
    if (want.size) {
      let overlap = 0;
      for (const id of combo.item_ids) {
        if (want.has(id)) overlap++;
      }
      if (overlap === 0 && hints.length === 0) continue;
      score += overlap * 5;
      // Prefer combos that complete cart items into a famous set
      if (overlap > 0 && overlap < combo.item_ids.length) score += 3;
    }
    if (score <= 0 && !want.size) score = 1; // allow listing defaults
    scored.push({ combo, score, available_ids });
  }

  scored.sort((a, b) => b.score - a.score || a.combo.name.localeCompare(b.combo.name));
  return scored.slice(0, limit);
}

export function getFamousCombination(id: string): FamousCombination | null {
  return FAMOUS_COMBINATIONS.find((c) => c.id === id) || null;
}

/** Pick the best combo for planning, filtered to items present in catalog. */
export function pickBestCombo(input: {
  catalogIds: Set<string>;
  item_ids?: string[];
  hints?: string[];
  declined?: Set<string>;
}): FamousCombination | null {
  const declined = input.declined || new Set<string>();
  const matches = matchFamousCombinations({
    item_ids: input.item_ids,
    hints: input.hints,
    limit: 20,
  });
  for (const m of matches) {
    const ids = m.combo.item_ids.filter(
      (id) => input.catalogIds.has(id) && !declined.has(id.toLowerCase())
    );
    // Need most of the combo available
    if (ids.length >= Math.min(2, m.combo.item_ids.length) || ids.length === m.combo.item_ids.length) {
      return {
        ...m.combo,
        item_ids: ids.length ? ids : m.combo.item_ids.filter((id) => input.catalogIds.has(id)),
      };
    }
  }
  return null;
}

/** Balanced role targets for a full meal (not appetizer-only). */
export const MEAL_ROLE_TARGETS: ComboRole[] = [
  "appetizer",
  "main",
  "dal",
  "starch",
  "bread",
  "dessert",
];

export function categoryToRole(categoryId: string): ComboRole | null {
  switch (categoryId) {
    case "cat-appetizers":
      return "appetizer";
    case "cat-vegetable-dishes":
    case "cat-pastas":
      return "main";
    case "cat-dal-soups":
      return "dal";
    case "cat-rice-noodles":
      return "starch";
    case "cat-breads-rotis":
      return "bread";
    case "cat-salads":
      return "salad";
    case "cat-desserts":
      return "dessert";
    case "cat-pizzas":
      return "pizza";
    case "cat-sides":
    case "cat-condiments":
      return "side";
    default:
      return null;
  }
}
