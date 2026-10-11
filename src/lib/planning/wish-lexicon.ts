/**
 * Reads menu wishes from the guest's own words. Vocabulary comes from the catalog
 * (dish names, categories) plus a small synonym table; handles "no / without / only / just".
 */
import type { MenuItem } from "@/lib/types";
import {
  emptyMenuWishes,
  mergeWishes,
  type CourseId,
  type CuisineId,
  type MenuWishes,
} from "@/lib/planning/menu-wishes";

type Term =
  | { kind: "cuisine"; id: CuisineId }
  | { kind: "course"; id: CourseId }
  | { kind: "item"; id: string }
  | { kind: "term"; word: string };

const CUISINE_WORDS: [RegExp, CuisineId][] = [
  [/\bpizzas?\b/, "pizza"],
  [/\bitalian\b/, "italian"],
  [/\bindo[- ]?chinese\b|\bchinese\b|\bhakka\b/, "indo_chinese"],
  [/\bsouth[- ]indian\b/, "south_indian"],
  [/\bthai\b/, "thai"],
  [/\b(north[- ])?indian\b|\bpunjabi\b|\bdesi\b/, "indian"],
];

const COURSE_WORDS: [RegExp, CourseId][] = [
  [/\b(appetizers?|starters?|snacks?|finger foods?|apps|hors d'?oeuvres)\b/, "appetizer"],
  [/\bchaats?\b/, "chaat"],
  [/\b(desserts?|sweets?|mithai)\b/, "dessert"],
  [/\b(drinks?|beverages?|chai|lassi|chaas)\b/, "drink"],
  [/\b(rice|biryani|pulao|noodles)\b/, "starch"],
  [/\b(breads?|rotis?|naans?|parathas?|pooris?|puris?)\b/, "bread"],
  [/\b(dals?|daal|lentils?)\b/, "dal"],
  [/\bsoups?\b/, "soup"],
  [/\bsalads?\b/, "salad"],
  [/\b(curry|curries|sabzis?|main course|mains|entrees?)\b/, "main"],
  [/\bpastas?\b/, "pasta"],
  [/\b(chutneys?|condiments?|pickles?|raita)\b/, "condiment"],
];

/** Ingredient / style words a guest may rule out. */
const TERM_WORDS: [RegExp, string][] = [
  [/\bpaneer\b/, "paneer"],
  [/\b(potato(es)?|aloo|batata)\b/, "potato"],
  [/\b(deep[- ])?fried\b|\bfry\b/, "fried"],
  [/\btofu\b/, "tofu"],
  [/\b(eggplants?|baingan|brinjal)\b/, "eggplant"],
  [/\b(cheese|mozzarella)\b/, "cheese"],
  [/\bchickpeas?|chole\b/, "chickpea"],
  [/\bcorn\b/, "corn"],
  [/\bcashews?\b/, "cashew"],
  [/\bcoconut\b/, "coconut"],
  [/\bcream\b|\bmalai\b/, "cream"],
];

const NEGATION =
  /\b(no|not|without|skip|avoid|except|exclude|minus|hold the|nothing(?! but)|none of|instead of|don'?t (want|need|include|like|add)|do not (want|need|include|like|add)|no more|remove|leave out)\b/;
const ONLY = /\b(only|just|purely|nothing but|all about)\b/;
/** "add some pizzas too" extends the menu rather than replacing its cuisine. */
const ADD_CUE = /\b(add|adding|also|too|as well|along with|alongside|plus|extra|throw in|in addition|on the side)\b/;
const QUESTION_START = /^\s*(do|does|is|are|what|which|how|why|when|where|who|can you tell)\b/;

const GENERIC = new Set([
  "vegetable", "vegetables", "veg", "paneer", "rice", "dal", "curry", "masala", "tray", "sauce",
  "fresh", "with", "chutney", "soup", "salad", "pizza", "pasta", "bread", "dressing", "special",
  "medium", "green", "sweet", "mint", "plant", "powered", "classic", "style", "tikka", "gravy",
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w: string): string {
  return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

/** Name variants a guest might say for each dish; single words only when unique to that dish. */
export function buildItemAliases(catalog: MenuItem[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const wordOwners = new Map<string, Set<string>>();
  for (const item of catalog) {
    const base = norm(item.name.replace(/\([^)]*\)/g, "").replace(/^\d+\s+/, "").replace(/\bw\b.*$/, ""));
    for (const variant of base.split("/").map((s) => s.trim()).filter(Boolean)) {
      const phrase = variant.split(" ").map(singular).join(" ");
      if (phrase.length >= 4) aliases.set(phrase, item.id);
    }
    for (const w of base.split(/[ /]+/)) {
      const word = singular(w);
      if (word.length < 5 || GENERIC.has(word)) continue;
      if (!wordOwners.has(word)) wordOwners.set(word, new Set());
      wordOwners.get(word)!.add(item.id);
    }
  }
  for (const [word, owners] of wordOwners) {
    if (owners.size === 1 && !aliases.has(word)) aliases.set(word, [...owners][0]);
  }
  return aliases;
}

type Hit = { term: Term; at: number };

function findHits(clause: string, aliases: Map<string, string>): Hit[] {
  const hits: Hit[] = [];
  const singularClause = clause.split(" ").map(singular).join(" ");
  const taken: [number, number][] = [];
  const longest = [...aliases.keys()].sort((a, b) => b.length - a.length);
  for (const alias of longest) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const m = re.exec(singularClause);
    if (!m) continue;
    const span: [number, number] = [m.index, m.index + alias.length];
    if (taken.some(([a, b]) => span[0] < b && span[1] > a)) continue;
    taken.push(span);
    hits.push({ term: { kind: "item", id: aliases.get(alias)! }, at: m.index });
  }
  const overlapsItem = (i: number) => taken.some(([a, b]) => i >= a && i < b);
  for (const [re, id] of CUISINE_WORDS) {
    const m = re.exec(clause);
    if (m && !overlapsItem(m.index)) hits.push({ term: { kind: "cuisine", id }, at: m.index });
  }
  for (const [re, id] of COURSE_WORDS) {
    const m = re.exec(clause);
    if (m && !overlapsItem(m.index)) hits.push({ term: { kind: "course", id }, at: m.index });
  }
  for (const [re, word] of TERM_WORDS) {
    const m = re.exec(clause);
    if (m && !overlapsItem(m.index)) hits.push({ term: { kind: "term", word }, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at);
}

function clauseWishes(clause: string, aliases: Map<string, string>): MenuWishes {
  const w = emptyMenuWishes();
  const hits = findHits(clause, aliases);
  const neg = NEGATION.exec(clause);
  const only = ONLY.exec(clause);
  const isNeg = (h: Hit) => Boolean(neg && neg.index <= h.at);
  const isOnly = (h: Hit) => Boolean(only && only.index <= h.at && !isNeg(h));

  for (const h of hits) {
    const t = h.term;
    if (t.kind === "cuisine") {
      if (isNeg(h)) continue;
      if (t.id === "pizza" && !isOnly(h) && ADD_CUE.test(clause)) {
        w.courses_add.push("pizza");
        continue;
      }
      w.cuisines.push({ id: t.id, mode: isOnly(h) ? "only" : "include" });
    } else if (t.kind === "course") {
      if (isNeg(h)) w.courses_exclude.push(t.id);
      else if (isOnly(h)) w.courses_only.push(t.id);
      else w.courses_add.push(t.id);
    } else if (t.kind === "item") {
      if (isNeg(h)) w.exclude_items.push(t.id);
      else w.must_have.push({ ref: t.id });
    } else if (isNeg(h)) {
      w.exclude_terms.push(t.word);
    }
  }

  if (/\b(not|no|less|without) (too |very |so )?spic(y|e)\b|\bmild\b|\bno heat\b/.test(clause)) {
    w.spice_max = "mild";
  } else if (/\bmedium spic/.test(clause)) {
    w.spice_max = "medium";
  } else if (/\b(extra|very|really) spicy\b|\bspicy\b/.test(clause) && !neg) {
    w.spice_max = "hot";
  }
  const size = /\b(10|12|14)\s*(?:-|\s)?(?:inch|inches|in|")/.exec(clause);
  if (size) w.size_pref = { pizza: size[1] as "10" | "12" | "14" };
  const tray = /\b(half|medium|full)[- ]size?\s*trays?\b/.exec(clause);
  if (tray) w.size_pref = { ...(w.size_pref || {}), tray: tray[1] as "half" | "medium" | "full" };
  if (/\blight (eaters?|lunch|meal|bites)\b|\bsmall portions?\b|\bnot (very )?hungry\b/.test(clause)) {
    w.appetite = "light";
  } else if (/\b(big|heavy|hearty|hungry) (eaters?|appetites?|group|meal)\b|\beat a lot\b/.test(clause)) {
    w.appetite = "hearty";
  }
  return w;
}

/** Split a message into clauses so "pizza, but no paneer" scopes the negation. */
function clauses(message: string): string[] {
  return message
    .split(/[.;!?\n]+|,\s*(?=(?:but|and|also|plus)\b)|\b(?:but|however|although)\b|(?=\bplus\b)/i)
    .map((s) => norm(s || ""))
    .filter(Boolean);
}

/** Every wish in the guest's messages, applied oldest to newest so later wording wins. */
export function wishesFromMessages(
  messages: { role: string; content: string }[],
  catalog: MenuItem[]
): MenuWishes {
  const aliases = buildItemAliases(catalog.filter((i) => i.is_available !== false));
  let wishes = emptyMenuWishes();
  for (const m of messages) {
    if (m.role !== "user") continue;
    const raw = m.content;
    const sentences = raw.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (sentence.trim().endsWith("?") && QUESTION_START.test(norm(sentence))) continue;
      for (const c of clauses(sentence)) {
        const next = clauseWishes(c, aliases);
        const extendsMenu =
          ADD_CUE.test(c) &&
          !wishes.cuisines.length &&
          next.cuisines.some((x) => x.mode === "include" && x.id !== "indian");
        if (extendsMenu) next.cuisines.unshift({ id: "indian", mode: "include" });
        wishes = mergeWishes(wishes, next);
      }
    }
  }
  return wishes;
}
