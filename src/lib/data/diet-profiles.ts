import type { DietTag } from "@/lib/types";

/** Primary dietary menus shown in the customer experience. */
export const PRIMARY_DIETS: DietTag[] = [
  "jain",
  "swaminarayan",
  "pushtimarg",
  "pure_vegetarian",
  "vegan",
  "italian",
];

export const DIET_LABELS: Record<DietTag, string> = {
  jain: "Jain",
  swaminarayan: "Swaminarayan",
  pushtimarg: "Pushtimarg",
  pure_vegetarian: "Pure Vegetarian",
  vegan: "Vegan",
  italian: "Italian",
};

export const DIET_BLURBS: Record<DietTag, string> = {
  jain: "Prepared in the spirit of ahimsa — no root vegetables, onion, garlic, or mushrooms.",
  swaminarayan:
    "Sattvic and temple-ready — onion-, garlic-, and mushroom-free, pure vegetarian.",
  pushtimarg:
    "Shuddha vegetarian offerings, suitable for seva, bhog, and celebration.",
  pure_vegetarian:
    "Classic Indian vegetarian — full flavor without onion, garlic, or mushrooms.",
  vegan: "Fully plant-based — no dairy, eggs, honey, or animal products.",
  italian:
    "Vegetarian Italian craft — pastas, salads, and Stone Craft pizzas.",
};

/**
 * Longer explanations drawn from traditional dietary practice:
 * Jain vegetarianism (ahimsa / no underground roots),
 * Swaminarayan satsang rules (no onion/garlic),
 * Pushtimarg (Vallabha) shuddha vegetarian seva food,
 * The Vegan Society definition,
 * and lacto-vegetarian Italian / Mediterranean cooking.
 */
export const DIET_DETAILS: Record<
  DietTag,
  { headline: string; body: string[]; principles: string[] }
> = {
  jain: {
    headline: "A kitchen guided by ahimsa",
    body: [
      "Jain food is rooted in ahimsa — non-violence toward all living beings. Meals are lacto-vegetarian: dairy is welcome, but meat, fish, and eggs are never used.",
      "What sets Jain cooking apart is the careful avoidance of root vegetables that grow underground and must be uprooted — onion, garlic, potato, carrot, beet, and similar roots. Our kitchen also never uses mushrooms. Dishes on this menu are selected or prepared so they honor that discipline.",
      "Choose Jain when your gathering follows Digambar or Svetambar practice, or when you simply want a lighter, onion-, garlic-, and mushroom-free table prepared with devotion.",
    ],
    principles: [
      "No meat, fish, or eggs",
      "No onion, garlic, mushrooms, or underground root vegetables",
      "Dairy allowed (paneer, ghee, milk sweets)",
      "Fresh preparation with mindful ingredients",
    ],
  },
  swaminarayan: {
    headline: "Sattvic food for satsang and home",
    body: [
      "Swaminarayan tradition asks for food that is sattvic — pure, calming, and fit for worship and family life. The kitchen remains strictly vegetarian, and onion, garlic, and mushrooms are left out so the meal stays temple-appropriate.",
      "Unlike Jain practice, many root vegetables such as potato are allowed when prepared without onion or garlic. The emphasis is on clean flavors, dairy when desired, and recipes suitable for mandir prasadam and household satsang.",
      "Select Swaminarayan for birthdays, festivals, and community meals where onion-, garlic-, and mushroom-free cooking is expected.",
    ],
    principles: [
      "Strictly vegetarian — no eggs or meat",
      "No onion, garlic, or mushrooms",
      "Potato and other non-prohibited roots allowed",
      "Dairy welcome; temple-friendly preparation",
    ],
  },
  pushtimarg: {
    headline: "Shuddha vegetarian for seva and joy",
    body: [
      "Pushtimarg, the path of grace taught by Śrī Vallabhācārya, treats food as an offering — bhog prepared with purity for the Lord, then shared as prasadam.",
      "This menu stays shuddha vegetarian: no meat or eggs, and traditionally no onion or garlic in foods meant for seva. Our kitchen also never uses mushrooms. Dairy sweets and rich vegetarian dishes belong here when they are prepared with that same standard of purity.",
      "Choose Pushtimarg for pujas, utsavs, and family celebrations where the meal itself is part of devotion.",
    ],
    principles: [
      "Shuddha (pure) vegetarian only",
      "Onion-, garlic-, and mushroom-free for seva-style cooking",
      "Dairy and traditional sweets permitted",
      "Prepared as offering-worthy, festive food",
    ],
  },
  pure_vegetarian: {
    headline: "Full-flavored Indian vegetarian",
    body: [
      "Pure vegetarian cooking here means a completely meatless kitchen — no eggs, fish, or meat — with classic Indian spice built without onion, garlic, or mushrooms. Our whole kitchen keeps those three out.",
      "This is the everyday celebration menu for guests who want traditional vegetarian taste with Yogiplate’s purity standard across every tray.",
    ],
    principles: [
      "No meat, fish, or eggs",
      "No onion, garlic, or mushrooms — kitchen-wide",
      "Dairy and traditional sweets included",
    ],
  },
  vegan: {
    headline: "Plant-based, nothing taken from animals",
    body: [
      "Vegan cooking excludes all animal products: no dairy, butter, ghee, paneer, cream, eggs, or honey — following the widely shared definition used by the Vegan Society and plant-based kitchens worldwide.",
      "What remains is color, spice, and craft — dals, vegetables, rice, chutneys, and plant-powered pizzas prepared so every guest can eat with confidence.",
    ],
    principles: [
      "No meat, dairy, eggs, or honey",
      "No ghee, butter, paneer, or cream",
      "No onion, garlic, or mushrooms — kitchen-wide",
      "Plant oils and plant proteins only",
      "Flavor built from spices, herbs, and produce",
    ],
  },
  italian: {
    headline: "Italian vegetarian, stone-baked and handmade",
    body: [
      "Italian vegetarian cooking celebrates the Mediterranean table — tomatoes, olive oil, herbs, pasta, and cheese — without meat. It is the cuisine of trattorias and home kitchens, adapted here for Bay Area gatherings.",
      "This path highlights our pastas, salads, soups, and Stone Craft pizzas. Many of these dishes can also appear under Jain, Swaminarayan, Pushtimarg, or Vegan when the recipe and prep match that path — for example a Jain-friendly Margherita or a fully plant-based soy chilli pizza.",
    ],
    principles: [
      "Vegetarian Italian classics (no meat)",
      "No onion, garlic, or mushrooms — kitchen-wide",
      "Pastas, salads, soups, and focaccia",
      "Stone Craft pizzas in multiple sizes",
      "Cross-listed when a dish also meets another diet",
    ],
  },
};
