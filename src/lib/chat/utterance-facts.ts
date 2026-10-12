import type { DietTag } from "@/lib/types";
import type { OrderDraft } from "@/lib/chat/order-draft";
import { normalizeDiet } from "@/lib/chat/order-draft";

export type UtteranceFacts = {
  occasion?: string;
  adults?: number;
  event_time?: string;
  diet?: DietTag;
};

const OCCASIONS: { re: RegExp; value: string }[] = [
  { re: /\bbirthdays?\b/i, value: "birthday" },
  { re: /\bwedding\b/i, value: "wedding" },
  { re: /\banniversary\b/i, value: "anniversary" },
  { re: /\bbaby\s*shower\b/i, value: "baby_shower" },
  { re: /\bnaming\b|\bnamakaran\b/i, value: "naming" },
  { re: /\bpuja\b|\bpooja\b/i, value: "puja" },
  { re: /\bengagement\b/i, value: "engagement" },
  { re: /\bhouse\s*warming\b|\bgriha\s*pravesh\b/i, value: "housewarming" },
  { re: /\bteam\s*lunch\b|\boffice\b|\bcorporate\b/i, value: "team_lunch" },
];

/** Spoken clock time → HH:mm (24h). */
export function extractSpokenEventTime(text: string): string | "" {
  const m = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i
  );
  if (!m) return "";
  let hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  const ap = m[3].replace(/\./g, "").toLowerCase();
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return "";
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return "";
  if (ap.startsWith("p") && hour < 12) hour += 12;
  if (ap.startsWith("a") && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Headcount from speech. Ignores “N pizzas / trays / plates” so food quantities
 * are not mistaken for guests.
 */
export function extractGuestCount(text: string): number | null {
  const patterns = [
    /\b(?:expecting|about|around|roughly|for)\s+(\d{1,3})\s*(?:guests?|people|folks|adults?)\b/i,
    /\b(\d{1,3})\s*(?:guests?|people|folks|adults?)\b/i,
    /\b(?:party|group)\s*(?:of|for)\s+(\d{1,3})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 500) return Math.floor(n);
  }
  return null;
}

export function extractOccasion(text: string): string | "" {
  for (const row of OCCASIONS) {
    if (row.re.test(text)) return row.value;
  }
  return "";
}

export function extractDietFromUtterance(text: string): DietTag | "" {
  const lower = text.toLowerCase();
  // STT often hears “Jane” for Jain.
  if (/\bjain\b|\bjane\b/.test(lower) && !/\bjane\s+[a-z]{2,}/i.test(text)) {
    return "jain";
  }
  if (/\bvegan\b/.test(lower)) return "vegan";
  if (/\bswaminarayan\b/.test(lower)) return "swaminarayan";
  if (/\bpushti|\bpushtimarg\b/.test(lower)) return "pushtimarg";
  if (/\bpure\s*veg|\bpure\s*vegetarian\b/.test(lower)) return "pure_vegetarian";
  if (/\bitalian\b/.test(lower)) return "italian";
  // Pizza party with no other diet → Italian menu path.
  if (/\bpizzas?\b/.test(lower)) return "italian";
  return normalizeDiet(text);
}

/** Facts spoken in this turn that should be saved even if the model skips tools. */
export function extractUtteranceFacts(text: string): UtteranceFacts {
  const facts: UtteranceFacts = {};
  const occasion = extractOccasion(text);
  if (occasion) facts.occasion = occasion;
  const adults = extractGuestCount(text);
  if (adults != null) facts.adults = adults;
  const event_time = extractSpokenEventTime(text);
  if (event_time) facts.event_time = event_time;
  const diet = extractDietFromUtterance(text);
  if (diet) facts.diet = diet;
  return facts;
}

/** Merge only empty draft slots from utterance facts (never overwrite known values). */
export function draftPatchFromUtterance(
  draft: OrderDraft,
  text: string
): Partial<OrderDraft> {
  const facts = extractUtteranceFacts(text);
  const patch: Partial<OrderDraft> = {};
  if (facts.occasion && !String(draft.occasion || "").trim()) {
    patch.occasion = facts.occasion;
  }
  if (facts.adults != null && (draft.adults == null || draft.adults <= 0)) {
    patch.adults = facts.adults;
  }
  if (facts.event_time && !String(draft.event_time || "").trim()) {
    patch.event_time = facts.event_time;
  }
  if (facts.diet && !String(draft.diet || "").trim()) {
    patch.diet = facts.diet;
  }
  // Explicit Jain/vegan wins over pizza→italian default when both appear.
  if (facts.diet === "jain" || facts.diet === "vegan") {
    patch.diet = facts.diet;
  }
  return patch;
}
