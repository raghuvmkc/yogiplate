import { DIET_LABELS } from "@/lib/data/diet-profiles";
import type { DietTag, MenuItem } from "@/lib/types";

/**
 * Scope item notes to the active menu path.
 * Pizza prep notes that list many diets are trimmed so only the
 * current tradition is named (or omitted when redundant).
 */
export function notesForActiveDiet(
  item: MenuItem,
  diet: DietTag | null | undefined
): string | undefined {
  const notes = item.notes?.trim();
  if (!notes) return undefined;

  const isMultiDietPrep =
    /jain\s*\/\s*swaminarayan/i.test(notes) ||
    (/prep available on request/i.test(notes) &&
      /jain|swaminarayan|vegan|pushtimarg/i.test(notes));

  if (!isMultiDietPrep) return notes;

  if (!diet) return "Stone Craft Pizza.";

  // Already browsing that tradition — name only this path, never the others.
  if (
    diet === "jain" ||
    diet === "swaminarayan" ||
    diet === "pushtimarg" ||
    diet === "vegan"
  ) {
    return `Stone Craft Pizza — ${DIET_LABELS[diet]} prep available on request.`;
  }

  // Italian / Pure Vegetarian: cuisine paths — no cross-listing other diets.
  return "Stone Craft Pizza.";
}
