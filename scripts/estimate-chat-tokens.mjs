import {
  buildLeanFrontDeskSystemPrompt,
  loadChatSkills,
  loadChatSkill,
  CHAT_SKILL_CATALOG,
} from "../src/lib/chat/skills.ts";

const tok = (s) => Math.ceil(String(s).length / 4);

const system = buildLeanFrontDeskSystemPrompt(false);

function bundle(ids) {
  const { loaded } = loadChatSkills(ids);
  const text = loaded.map((l) => l.content).join("\n\n");
  return {
    ids,
    tokens: tok(text),
    per: loaded.map((l) => ({ id: l.id, tokens: tok(l.content) })),
  };
}

const def = bundle(["business", "ordering", "diets"]);
const cart = bundle(["business", "ordering", "diets", "menu-index"]);
const heavy = bundle([
  "business",
  "ordering",
  "diets",
  "menu-index",
  "menu-vegetable-dishes",
  "menu-rice-noodles",
]);

const turnInstr = tok(
  `Relevant kitchen knowledge... Return ONLY JSON... Available: ${CHAT_SKILL_CATALOG.map((s) => s.id).join(", ")}`
);
const userQ = tok(
  "Is whatever I added is sufficient for 20 people dinner?"
);
const lead = tok(
  JSON.stringify({
    name: "Raghu",
    phone: "4079688422",
    email: "raghuvmkc@gmail.com",
  })
);
const cartJson = tok(
  JSON.stringify({
    item_count: 2,
    guest_count: 20,
    items: [
      { name: "Palak Paneer", quantity: 1, price: 85 },
      { name: "Vegetable Pulao", quantity: 1, price: 55 },
    ],
  })
);
const reply = tok(
  "For 20 dinner guests, two trays is usually light. Plan roughly one veg tray per 8–10 people plus rice and bread, and we can shape a fuller menu if you share diet preference."
);

function costs(inputTok, outputTok) {
  // Ballpark Gemini Flash-class pricing (verify in Google AI Studio billing).
  const tiers = [
    { name: "low", inPerM: 0.075, outPerM: 0.3 },
    { name: "mid", inPerM: 0.15, outPerM: 0.6 },
    { name: "high", inPerM: 0.3, outPerM: 2.5 },
  ];
  return tiers.map((t) => ({
    tier: t.name,
    usd: Number(
      ((inputTok / 1e6) * t.inPerM + (outputTok / 1e6) * t.outPerM).toFixed(6)
    ),
  }));
}

const oneTurnInput =
  tok(system) + cart.tokens + turnInstr + userQ + lead + cartJson;
const oneTurnOutput = reply;

let hist = 0;
let threeIn = 0;
let threeOut = 0;
for (let i = 0; i < 3; i++) {
  const inTok =
    tok(system) + cart.tokens + turnInstr + lead + cartJson + hist + userQ;
  const outTok = reply;
  threeIn += inTok;
  threeOut += outTok;
  hist += userQ + outTok;
}

const skillRows = CHAT_SKILL_CATALOG.map((s) => ({
  id: s.id,
  tokens: tok(loadChatSkill(s.id)),
}));

console.log(
  JSON.stringify(
    {
      system_tokens: tok(system),
      all_skills_if_loaded_tokens: skillRows.reduce((n, r) => n + r.tokens, 0),
      skill_rows: skillRows,
      prefetch_default_tokens: def.tokens,
      prefetch_cart_tokens: cart.tokens,
      prefetch_heavy_tokens: heavy.tokens,
      turn_instruction_tokens: turnInstr,
      one_turn_cart_question: {
        input_tokens: oneTurnInput,
        output_tokens: oneTurnOutput,
        total_tokens: oneTurnInput + oneTurnOutput,
        overhead_share:
          Math.round(
            ((oneTurnInput - userQ) / oneTurnInput) * 1000
          ) / 10 + "%",
        costs_usd: costs(oneTurnInput, oneTurnOutput),
      },
      three_turn_conversation: {
        input_tokens: threeIn,
        output_tokens: threeOut,
        total_tokens: threeIn + threeOut,
        costs_usd: costs(threeIn, threeOut),
      },
      notes: [
        "Token estimate ≈ characters/4 (rough).",
        "Current agent prefetches business+ordering+diets (+ menu-index for food/guest questions).",
        "Prices are Flash-class ballparks — confirm exact gemini-3.8-flash rates in Google AI Studio.",
      ],
    },
    null,
    2
  )
);
