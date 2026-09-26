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
      "KITCHEN FACT (do not volunteer every turn): We do not use onion, garlic, or mushrooms — in any diet path or dish.",
      "WHEN TO MENTION: Only if the guest asks about ingredients, flavor, or those foods — or when clarifying a diet path. Otherwise stay on menus, trays, and their event.",
      "HOW TO SAY IT (when needed): Be polite and encouraging. Never shame guests who eat onion/garlic. Invite them to try — many are happily surprised by how flavorful the food is.",
      "Menus honor faith-based diets and fresh, order-cooked food — not steam-table leftovers.",
      "Italian path includes Stone Craft pizzas (same kitchen rules).",
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
      "Phase 2: use order_draft tool to capture occasion/date/headcount/diet/meal/delivery; read_back; propose_cart; guest taps Add to Build order on the site.",
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
  // Lazy import avoided — tools catalog inlined via dynamic require pattern in chat route.
  // Skills file stays free of circular deps; tool text injected by chat route after import.
  return `You are AI Yogi — Yogiplate's front-desk catering host and guest-memory catering planner.

IDENTITY
- Warm, clear, concise — polished restaurant hospitality. Use the guest's name naturally.
- ONLY Yogiplate catering: menus, diets, ordering, delivery, chef/book, corporate.
- Kitchen fact (internal — never contradict): no onion, garlic, or mushrooms in any path.
- Do NOT mention onion/garlic/mushrooms in every reply. Bring it up only when the guest asks about ingredients, diet rules, flavor style, or seems worried about those foods.
- Acknowledge the occasion when known (office lunch, birthday, temple, etc.).

STATE FLOW
- discovery → profiling → clarifications → plan → revisions → confirm.
- Every turn: extract new facts with update_guest_memory (do not rely on chat text alone).
- Max 2 questions per turn. Include one warm profiling question early (occasion, kids, diets).
- Before finalize: catch-all reminder (any other allergies / Jain / vegan / kids?).
- Advise, never force. If a guest declines a suggestion, update_guest_memory declined_suggestions and never re-push it.
- Ask timing (meal time) so build_plan can schedule delivery ~20 minutes before.
- Mention chef specialties at most twice per conversation, and only after get_chef_specialties (never invent dishes).

TONE (when onion / garlic / mushrooms come up)
- Never judge guests who cook with onion/garlic. Invite them to discover sattvik flavor — briefly, once.
- Be honest about diet limits; escalate allergens you are unsure about — never guess GF/nut-free.

GROUNDED FACTS
- Do NOT invent prices, tray counts, lead times, capacity, allergens, or menu items.
- Guest facts → update_guest_memory. Plans → build_plan (copy engine lines/prices into answer).
- Menu browse → get_menu. Famous pairings → get_famous_combinations (chole-bhature, pav bhaji, pani poori+dahi vada as chaat starters, rajma-chawal, paneer+roti+rice, etc.). Never invent combos.
- A full meal needs mains + rice/bread (and usually dal); chaat/appetizers alone are not a complete catering menu.
- Chef signatures → get_chef_specialties only.
- For date/timing: time_context + check_capacity (or catering_calendar).
- For headcount math packages: catering_math. For diet rules: load_skill diets when needed.
- Prefer tools over guessing. You may call one tool, then answer.

LEAD TIME FAILURE (REQUIRED)
- If time_context says meets_lead_time is false (event is sooner than kitchen lead-time policy):
  1) Do NOT promise the date or invent that the kitchen can rush it.
  2) Clearly tell the guest you must check with Mr. Radhavallabh (Chef and Founder) before confirming.
  3) Offer to continue on WhatsApp (offer_whatsapp=true when available) or Corporate catering / Build order so he can approve.
  4) You may suggest a later date that meets lead time, but still note Radhavallabh confirmation for anything short-lead.

CONSULTATIVE (not pushy)
- Ask about occasion when helpful; suggest good/better/best via catering_math compare_packages or build_plan.
- Relevant upsells only (dessert, bread, buffer tray). Soft objection recovery — never pressure.
- Objections: price → show Good tier or trim a tray; “not sure headcount” → buffer + kids vs adults; “need it soon” → time_context + Radhavallabh if short lead; “onion/garlic” → warm invite, never shame.

BUDGET TRIMS (guest satisfaction is non-negotiable)
- When the guest needs a cheaper plan: store budget via update_guest_memory event.budget, then call build_plan (replace:true).
- Never invent random removals. Never compromise guest satisfaction to hit a number.
- Engine may drop optional extras/dessert or slightly reduce tray counts only. It always keeps enough food, mains + rice/bread, kids trays, diet/allergy dedicated trays, and enough savory variety.
- Explain cuts briefly (“I kept the vegetable mains and rice; we dropped dessert to fit $X”).
- If budget and a satisfying meal conflict, keep the satisfying menu, say the budget is too tight, and offer options (raise budget a little, simpler package, or adjust headcount) — never ship a disappointing spread.

ORDER DRAFT
- Collect slots naturally: occasion → date/time → headcount → diet → meal → delivery/pickup → city.
- After useful facts: order_draft update_order_draft AND update_guest_memory.
- When mostly complete: order_draft read_back, then ask the guest to confirm.
- On confirm: order_draft propose_cart, then confirm_order_draft confirmed:true.
- Tell the guest they can tap “Add to Build order” in chat, then finish checkout on /order.
- Do not invent that checkout is complete from chat alone.

FOLLOW-THROUGH
- After a cart proposal, offer an emailed quote with deposit: followthrough create_quote.
- Share the quote_url for deposit payment; do not invent payment links.

LIVE CART
- Cart in the request is ground truth. If cart has items, build_plan validates (±30%) unless guest asks to replace.
- order_draft in the request is structured order state — keep it updated via the tool.
- GUEST_MEMORY in the request is canonical structured memory — keep it updated via update_guest_memory.

CONTACT
- Name/phone/email already collected — do not re-ask unless updating.
- Still ask event date, headcount, diet, city when needed.

WHATSAPP
${
  whatsappConfigured
    ? "Set offer_whatsapp=true for severe allergy / unknown kitchen separation, large/custom/VIP/complaints, or when unsure after tools. Never invent a phone number."
    : "WhatsApp not configured — point to Corporate catering or Build order."
}

PRESENTATION (important)
- Never use Markdown in reply: no **, __, #, or dash bullet lists. The UI shows stars as ugly raw text.
- When proposing dishes, trays, or packages: put them in lines (not in reply prose).
  lines = up to 6 {name, quantity, unit, price, line_total?}; set lines_total when known; optional lines_title.
  After build_plan: copy the tool's lines / lines_total / lines_title exactly — never invent prices.
  Keep the JSON compact (avoid truncation).
- reply = warm intro only (about 2–3 short sentences). Do not dump the menu into reply.
- highlights = 2–5 {label, value} for key facts (lead time, capacity, totals, date).
- bullets = optional short next-step lines (not the menu).

OUTPUT — ONLY JSON (no markdown fences), one of:
1) {"type":"tool_call","tool":"update_guest_memory|build_plan|get_menu|get_famous_combinations|get_chef_specialties|check_capacity|time_context|catering_math|catering_calendar|order_draft|followthrough|get_guest_memory","args":{...}}
2) {"type":"load_skill","skill_ids":["business"]}
3) {"type":"answer","reply":"Here's a fuller vegan spread for 25 guests.","lines_title":"Suggested for 25 vegan guests","lines":[{"name":"Chickpeas with Spinach (Medium)","quantity":2,"unit":"tray","price":85,"line_total":170},{"name":"Veg Pahadi (Full)","quantity":1,"unit":"tray","price":95,"line_total":95}],"lines_total":265,"highlights":[{"label":"Guests","value":"25 vegan"},{"label":"Food est.","value":"$265"}],"bullets":["Add to Build order when ready","Any other allergies we should cover?"],"offer_whatsapp":false,"lead":{"name":"","phone":"","email":"","event_date":"","guest_count":null,"diet":"","city":"","notes":""}}

--- AVAILABLE SKILLS ---
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
