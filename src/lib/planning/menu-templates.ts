/**
 * Course and cuisine templates as data. Items map to courses by catalog category plus name
 * patterns, so new dishes need no code change.
 */
import type { MenuItem } from "@/lib/types";
import type { MealKind } from "@/lib/planning/portion-rules";
import type { CourseId, CuisineId, MenuWishes } from "@/lib/planning/menu-wishes";

const CHAAT = /pani ?poori|chaat|bhel|dahi vada|mumbai bhaji|pav bhaji|sev ?puri/i;
const SOUP = /soup|sambar|rasam|manchow|wanton/i;
const BREADISH = /poori|puri|bhatura|focaccia|pav\b|naan|kulcha|paratha|roti/i;

/** The course a dish fills on a menu. */
export function courseOf(item: MenuItem): CourseId | null {
  const name = item.name;
  switch (item.category_id) {
    case "cat-appetizers":
      return CHAAT.test(name) ? "chaat" : "appetizer";
    case "cat-vegetable-dishes":
      return "main";
    case "cat-pastas":
      return SOUP.test(name) ? "soup" : "pasta";
    case "cat-dal-soups":
      return SOUP.test(name) ? "soup" : "dal";
    case "cat-rice-noodles":
      return "starch";
    case "cat-breads-rotis":
      return "bread";
    case "cat-sides":
      return BREADISH.test(name) ? "bread" : "condiment";
    case "cat-salads":
      return "salad";
    case "cat-desserts":
      return "dessert";
    case "cat-drinks":
      return "drink";
    case "cat-condiments":
      return "condiment";
    case "cat-pizzas":
      return "pizza";
    default:
      return null;
  }
}

const INDO_CHINESE = /manchurian|chow ?mein|chinese|manchow|wanton|hakka|chil+i paneer|schezwan|szechuan/i;
/** The "italian" diet tag marks Stone Craft menu availability, not cuisine, so match by name. */
const ITALIAN = /italian|risotto|focaccia|caprese|greek|arugula|orzo|lasagna|marinara|basil|minestrone|bruschetta|garlic bread|pesto|fresh tomato sauce/i;
const THAI = /\bthai\b|pad noodles/i;
const SOUTH_INDIAN = /idli|dosa|uttapam|urad vada|medu vada|sambar|upma|coconut.*chutney|rasam/i;

/** The cuisine a dish belongs to. */
export function cuisineOf(item: MenuItem): CuisineId {
  if (item.category_id === "cat-pizzas") return "pizza";
  const name = item.name;
  if (INDO_CHINESE.test(name)) return "indo_chinese";
  if (THAI.test(name)) return "thai";
  if (SOUTH_INDIAN.test(name)) return "south_indian";
  if (item.category_id === "cat-pastas" || ITALIAN.test(name)) return "italian";
  return "indian";
}

/** Cuisines that pair naturally, used when a course has no dish in the requested cuisine. */
const CUISINE_FRIENDS: Record<CuisineId, CuisineId[]> = {
  pizza: ["italian"],
  italian: ["pizza"],
  indian: ["south_indian"],
  south_indian: ["indian"],
  indo_chinese: ["thai"],
  thai: ["indo_chinese"],
};

export function cuisineFits(item: MenuItem, cuisine: CuisineId, strict: boolean): boolean {
  const c = cuisineOf(item);
  if (c === cuisine) return true;
  if (strict) return false;
  return CUISINE_FRIENDS[cuisine].includes(c);
}

export type CourseSlot = {
  course: CourseId;
  cuisine: CuisineId;
  /** How many different dishes fill this course. */
  dishes: number;
  /** Fraction of the headcount this course must feed (split across its dishes). */
  coverage: number;
  /** Dish must come from this cuisine (no friendly fallback). */
  strict: boolean;
  /** Added because the guest asked for it. */
  requested?: boolean;
};

type TemplateRow = [CourseId, number, number];

/** [course, dishes, coverage] per template. */
const MEAL_TEMPLATES: Record<MealKind, TemplateRow[]> = {
  lunch: [
    ["appetizer", 1, 0.7],
    ["main", 2, 1],
    ["dal", 1, 0.8],
    ["starch", 1, 1],
    ["bread", 1, 1],
  ],
  dinner: [
    ["appetizer", 1, 0.7],
    ["main", 2, 1],
    ["dal", 1, 0.8],
    ["starch", 1, 1],
    ["bread", 1, 1],
  ],
  brunch: [
    ["appetizer", 1, 0.7],
    ["main", 1, 1],
    ["bread", 1, 1],
    ["dessert", 1, 0.8],
  ],
  snack: [
    ["appetizer", 2, 1],
    ["chaat", 1, 0.8],
    ["drink", 1, 1],
  ],
};

const CUISINE_TEMPLATES: Record<CuisineId, TemplateRow[]> = {
  indian: MEAL_TEMPLATES.lunch,
  pizza: [
    ["pizza", 3, 1],
    ["salad", 1, 0.7],
  ],
  italian: [
    ["pasta", 1, 0.6],
    ["pizza", 2, 0.6],
    ["salad", 1, 0.7],
    ["bread", 1, 0.8],
  ],
  indo_chinese: [
    ["appetizer", 1, 0.7],
    ["main", 1, 1],
    ["starch", 2, 1],
    ["soup", 1, 0.6],
  ],
  south_indian: [
    ["appetizer", 2, 1],
    ["soup", 1, 0.8],
    ["condiment", 1, 0.6],
    ["starch", 1, 0.8],
  ],
  thai: [
    ["main", 1, 1],
    ["starch", 2, 1],
  ],
};

/** Courses that make up the "meal" part; split across cuisines when several are wanted. */
const MEAL_COURSES = new Set<CourseId>(["main", "pasta", "pizza", "starch", "dal", "bread"]);

/** Default coverage and dish count for a course added on request. */
const ADDED_COURSE: Record<CourseId, [number, number]> = {
  appetizer: [1, 0.7],
  chaat: [1, 0.6],
  main: [1, 0.8],
  pasta: [1, 0.6],
  dal: [1, 0.8],
  soup: [1, 0.6],
  starch: [1, 0.9],
  bread: [1, 0.9],
  salad: [1, 0.7],
  dessert: [1, 0.9],
  drink: [1, 1],
  condiment: [1, 0.5],
  pizza: [2, 0.6],
};

/** When a menu is only one of these, guests graze on several dishes and eat more of it. */
const GRAZING_COURSES = new Set<CourseId>(["appetizer", "chaat", "dessert"]);

/** Pizza varieties scale with the headcount: about one style per ten guests, two to four styles. */
export function pizzaVarieties(guests: number): number {
  return Math.min(4, Math.max(2, Math.ceil(guests / 10)));
}

/** Turn meal + wishes into the course slots to fill. */
export function resolveCourses(input: {
  meal: MealKind;
  wishes: MenuWishes;
  guests: number;
}): CourseSlot[] {
  const { wishes, meal, guests } = input;
  const cuisines = wishes.cuisines.length
    ? wishes.cuisines
    : [{ id: "indian" as CuisineId, mode: "include" as const }];
  const strict = cuisines.some((c) => c.mode === "only");
  const multi = cuisines.length > 1;
  let slots: CourseSlot[] = [];

  if (wishes.courses_only.length) {
    const primary = cuisines[0].id;
    const single = wishes.courses_only.length === 1;
    slots = wishes.courses_only.map((course) => {
      const grazing = single && GRAZING_COURSES.has(course);
      return {
        course,
        cuisine: primary,
        dishes:
          course === "pizza"
            ? pizzaVarieties(guests)
            : grazing
              ? 3
              : ADDED_COURSE[course][0] + (single ? 1 : 0),
        coverage: grazing ? 1.6 : 1,
        strict,
        requested: true,
      };
    });
  } else {
    for (const c of cuisines) {
      const base = c.id === "indian" ? MEAL_TEMPLATES[meal] : CUISINE_TEMPLATES[c.id];
      for (const [course, dishes, coverage] of base) {
        if (c.mode === "only" && !isCuisineCourse(c.id, course)) continue;
        const share = multi && MEAL_COURSES.has(course) ? 1 / cuisines.length : 1;
        let n = dishes;
        if (course === "pizza") n = multi ? Math.max(1, Math.round(pizzaVarieties(guests) / 2)) : pizzaVarieties(guests);
        else if (multi && n > 1) n = 1;
        const existing = slots.find((s) => s.course === course);
        if (existing && !MEAL_COURSES.has(course)) continue;
        slots.push({ course, cuisine: c.id, dishes: n, coverage: coverage * share, strict: c.mode === "only" });
      }
    }
    for (const course of wishes.courses_add) {
      if (slots.some((s) => s.course === course)) continue;
      const [dishes, coverage] = ADDED_COURSE[course];
      slots.push({
        course,
        cuisine: cuisines[0].id,
        dishes: course === "pizza" ? Math.max(1, Math.round(pizzaVarieties(guests) / 2)) : dishes,
        coverage,
        strict: false,
        requested: true,
      });
    }
  }

  return slots.filter((s) => !wishes.courses_exclude.includes(s.course));
}

/** Courses that exist in a cuisine when the guest wants only that cuisine. */
function isCuisineCourse(cuisine: CuisineId, course: CourseId): boolean {
  if (cuisine === "pizza") return course === "pizza";
  return true;
}
