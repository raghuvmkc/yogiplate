import catalog from "@/lib/data/catering-catalog.json";
import {
  DIET_BLURBS,
  DIET_DETAILS,
  DIET_LABELS,
  PRIMARY_DIETS,
} from "@/lib/data/diet-profiles";

type CatalogItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  diet_tags: string[];
  is_available: boolean;
  variants?: { label: string; price: number; serves?: number }[];
};

type CatalogCategory = { id: string; name: string; sort_order: number };

export type ChatSkillId =
  | "business"
  | "diets"
  | "ordering"
  | "whatsapp"
  | "menu-index"
  | "menu-appetizers"
  | "menu-salads"
  | "menu-vegetable-dishes"
  | "menu-dal-soups"
  | "menu-rice-noodles"
  | "menu-breads-rotis"
  | "menu-desserts"
  | "menu-condiments"
  | "menu-pastas"
  | "menu-sides"
  | "menu-pizzas"
  | "menu-packages";

const CATEGORY_SKILL: Record<string, ChatSkillId> = {
  "cat-appetizers": "menu-appetizers",
  "cat-salads": "menu-salads",
  "cat-vegetable-dishes": "menu-vegetable-dishes",
  "cat-dal-soups": "menu-dal-soups",
  "cat-rice-noodles": "menu-rice-noodles",
  "cat-breads-rotis": "menu-breads-rotis",
  "cat-desserts": "menu-desserts",
  "cat-condiments": "menu-condiments",
  "cat-pastas": "menu-pastas",
  "cat-sides": "menu-sides",
  "cat-pizzas": "menu-pizzas",
  "cat-packages": "menu-packages",
};

function formatItem(item: CatalogItem): string {
  const diets = (item.diet_tags || []).join(", ");
  let price = `from $${item.price}`;
  if (item.variants?.length) {
    price = item.variants
      .map(
        (v) =>
          `${v.label} $${v.price}${v.serves ? ` (serves ~${v.serves})` : ""}`
      )
      .join("; ");
  }
  return `- ${item.name}: ${item.description} | ${price} | diets: ${diets || "n/a"}`;
}

function menuCategorySection(categoryId: string): string {
  const cat = (catalog.categories as CatalogCategory[]).find(
    (c) => c.id === categoryId
  );
  if (!cat) return "Category not found.";
  const items = (catalog.items as CatalogItem[]).filter(
    (i) => i.category_id === categoryId && i.is_available !== false
  );
  return [`## ${cat.name}`, ...items.map(formatItem)].join("\n");
}

function buildMenuIndex(): string {
  const categories = (catalog.categories as CatalogCategory[])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const items = catalog.items as CatalogItem[];
  return categories
    .map((cat) => {
      const count = items.filter(
        (i) => i.category_id === cat.id && i.is_available !== false
      ).length;
      const skill = CATEGORY_SKILL[cat.id];
      return `- ${cat.name} (${count} items) → load skill \`${skill}\``;
    })
    .join("\n");
}

function buildDiets(): string {
  return PRIMARY_DIETS.map((diet) => {
    const d = DIET_DETAILS[diet];
    return [
      `### ${DIET_LABELS[diet]}`,
      DIET_BLURBS[diet],
      d.headline,
      ...d.body,
      `Principles: ${d.principles.join("; ")}`,
    ].join("\n");
  }).join("\n\n");
}

/** Catalog of loadable skills — descriptions only (kept lean for discovery). */
export const CHAT_SKILL_CATALOG: {
  id: ChatSkillId;
  title: string;
  when: string;
}[] = [
  {
    id: "business",
    title: "Yogiplate business basics",
    when:
      "About the kitchen, chef, service area, brand story, or onion/garlic/mushroom policy (say it warmly and invitingly)",
  },
  {
    id: "diets",
    title: "Diet paths",
    when: "Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, Italian rules",
  },
  {
    id: "ordering",
    title: "Ordering & website flow",
    when: "How to build an order, trays, checkout, corporate form",
  },
  {
    id: "whatsapp",
    title: "Human handoff",
    when: "When to offer owner WhatsApp / call takeover",
  },
  {
    id: "menu-index",
    title: "Menu category index",
    when: "Discover which menu skill to load next; never load all categories at once",
  },
  {
    id: "menu-appetizers",
    title: "Appetizers menu",
    when: "Pakoras, starters, snacks",
  },
  { id: "menu-salads", title: "Salads menu", when: "Salads and cold greens" },
  {
    id: "menu-vegetable-dishes",
    title: "Vegetable dishes",
    when: "Curries, sabzi, paneer mains",
  },
  {
    id: "menu-dal-soups",
    title: "Dal & soups",
    when: "Dals, soups, broths",
  },
  {
    id: "menu-rice-noodles",
    title: "Rice & noodles",
    when: "Biryani, pulao, rice, noodles",
  },
  {
    id: "menu-breads-rotis",
    title: "Breads / rotis",
    when: "Roti, poori, pav, focaccia",
  },
  { id: "menu-desserts", title: "Desserts", when: "Sweets and desserts" },
  {
    id: "menu-condiments",
    title: "Condiments / chutneys",
    when: "Chutneys and sides condiments",
  },
  { id: "menu-pastas", title: "Pastas", when: "Italian pasta dishes" },
  { id: "menu-sides", title: "Sides", when: "Side breads and extras" },
  {
    id: "menu-pizzas",
    title: "Pizzas (Stone Craft)",
    when: "Stone Craft pizzas",
  },
  {
    id: "menu-packages",
    title: "Catering packages",
    when: "Bundled catering packages",
  },
];

const SKILL_LOADERS: Record<ChatSkillId, () => string> = {
  business: () =>
    [
      "Yogiplate is Bay Area pure vegetarian catering.",
      "Chef & Founder: Radhavallabh (IIT Bombay graduate, monk, author of The Fundamentals of Sattvik Food, Penguin Press India).",
      "Kitchen: Fremont, CA. Delivery across the Bay Area.",
      "KITCHEN FACT: We do not use onion, garlic, or mushrooms — in any diet path or dish.",
      "HOW TO SAY IT: Be polite and encouraging. Never shame guests who eat onion/garlic. Invite them to try — many onion-and-garlic lovers are happily surprised by how flavorful and satisfying our food is, thanks to spices, herbs, tomatoes, and the chef’s craft.",
      "Example tone: “Our kitchen cooks without onion, garlic, or mushrooms — and guests who enjoy those ingredients every day often tell us the trays still taste rich and complete. You’re very welcome to try a few favorites and see.”",
      "Menus honor faith-based diets and fresh, order-cooked food — not steam-table leftovers.",
      "Italian path includes Stone Craft pizzas (still without onion, garlic, or mushrooms).",
    ].join("\n"),
  diets: buildDiets,
  ordering: () =>
    [
      "Guests build orders at /order after choosing a diet path.",
      "Pure Vegetarian shows the broadest catalog; other paths filter by tradition.",
      "Most trays offer Half / Medium / Full with approximate guest serves.",
      "Corporate inquiries: /corporate-catering form (team emails owners; customers do not see staff emails).",
      "Chat should never invent prices — load the relevant menu skill first.",
      "When the guest has a live cart, treat that cart as ground truth for what they are building.",
    ].join("\n"),
  whatsapp: () =>
    [
      "Offer WhatsApp only when the guest wants a human, the request is complex/custom,",
      "the party is large, pricing needs negotiation, or chat cannot fully help.",
      "Set offer_whatsapp=true in the final JSON. Do not invent a phone number;",
      "the website shows the WhatsApp button when configured.",
      "If WhatsApp is not configured, collect phone/email and point to Corporate catering or Build order.",
    ].join("\n"),
  "menu-index": buildMenuIndex,
  "menu-appetizers": () => menuCategorySection("cat-appetizers"),
  "menu-salads": () => menuCategorySection("cat-salads"),
  "menu-vegetable-dishes": () => menuCategorySection("cat-vegetable-dishes"),
  "menu-dal-soups": () => menuCategorySection("cat-dal-soups"),
  "menu-rice-noodles": () => menuCategorySection("cat-rice-noodles"),
  "menu-breads-rotis": () => menuCategorySection("cat-breads-rotis"),
  "menu-desserts": () => menuCategorySection("cat-desserts"),
  "menu-condiments": () => menuCategorySection("cat-condiments"),
  "menu-pastas": () => menuCategorySection("cat-pastas"),
  "menu-sides": () => menuCategorySection("cat-sides"),
  "menu-pizzas": () => menuCategorySection("cat-pizzas"),
  "menu-packages": () => menuCategorySection("cat-packages"),
};

export function isChatSkillId(id: string): id is ChatSkillId {
  return id in SKILL_LOADERS;
}

export function loadChatSkill(id: ChatSkillId): string {
  return SKILL_LOADERS[id]();
}

export function loadChatSkills(ids: string[]): {
  loaded: { id: string; content: string }[];
  skipped: string[];
} {
  const loaded: { id: string; content: string }[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!isChatSkillId(id)) {
      skipped.push(id);
      continue;
    }
    loaded.push({ id, content: loadChatSkill(id) });
  }
  return { loaded, skipped };
}

export function skillCatalogForPrompt(): string {
  return CHAT_SKILL_CATALOG.map(
    (s) => `- \`${s.id}\` — ${s.title}. Use when: ${s.when}`
  ).join("\n");
}

export function buildLeanFrontDeskSystemPrompt(whatsappConfigured: boolean): string {
  return `You are the Yogiplate front-desk chat assistant on the official Yogiplate catering website.

IDENTITY
- Warm, clear, concise — like a polished restaurant front desk.
- You ONLY discuss Yogiplate catering: menus, diets, ordering, delivery area, chef/book, corporate catering.
- Kitchen fact (never contradict): Yogiplate does not use onion, garlic, or mushrooms in the kitchen — for any menu path.
- Refuse off-topic questions in one short sentence and steer back to Yogiplate.

TONE WHEN DISCUSSING ONION / GARLIC / MUSHROOMS
- Many guests eat onion and garlic every day — never judge, correct, or make them feel wrong for that.
- Speak with warmth and invitation, not restriction or superiority.
- Frame our kitchen as a delightful discovery: pure, sattvik-style flavor that still tastes rich and celebratory — guests are often surprised how complete the food feels without those ingredients.
- Prefer phrases like “you’re welcome to try,” “many guests who love onion and garlic tell us…,” “our chef builds depth with spices, herbs, tomatoes, and slow cooking,” over “we don’t allow” or “you shouldn’t eat.”
- If they ask “do you use onion/garlic/mushrooms?”, answer honestly and briefly, then pivot to what they will taste and how to order.

SKILL TOOL (REQUIRED FOR FACTS)
- Do NOT invent dishes, prices, or diet rules.
- Use a ReAct loop: first return JSON to load skills, then return the final answer JSON.
- Load only what you need (usually 1–3 skills). Typical: \`business\` for chef/brand; \`menu-index\` then a \`menu-*\` skill for food; \`diets\` for tradition rules; \`ordering\` for website flow; \`whatsapp\` before offering handoff.
- Never request every menu skill at once.

LIVE ORDER AWARENESS
- Requests may include the guest's Build-order cart. Treat it as ground truth. Reference it when helpful. Do not pressure them.

CONTACT GATE
- Name, phone, and email are already collected by the website before chat starts. They arrive in the lead object — do not re-ask for them unless the guest wants to update them.
- Greet using their name when natural. You may still ask for event date, guest count, city, or notes when helpful.

WHATSAPP
${
  whatsappConfigured
    ? "You may set offer_whatsapp=true when a human is needed (after loading \`whatsapp\` if unsure). The site shows the button — never invent a number."
    : "WhatsApp is not configured. Suggest Corporate catering or Build order for human follow-up; you already have their phone/email."
}

REACT OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences), one of:
1) {"type":"load_skill","skill_ids":["business"]}
2) {"type":"answer","reply":"customer-facing message","offer_whatsapp":false,"lead":{"name":"","phone":"","email":"","event_date":"","guest_count":null,"diet":"","city":"","notes":""}}

Keep reply under ~120 words unless listing several menu items.

--- AVAILABLE SKILLS (load selectively) ---
${skillCatalogForPrompt()}
`;
}

/** Gemini function declaration for selective skill loading. */
export const LOAD_SKILL_TOOL = {
  name: "load_skill",
  description:
    "Load one or more Yogiplate knowledge skill sections into context. Use selectively — only the sections needed to answer the guest. Prefer menu-index before loading multiple menu categories.",
  parameters: {
    type: "object",
    properties: {
      skill_ids: {
        type: "array",
        items: {
          type: "string",
          description: `Skill id. One of: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`,
        },
        description: "Skill ids to load (1–3 recommended).",
      },
    },
    required: ["skill_ids"],
  },
};
