import { menuItems } from "@/lib/data/menu-seed";
import type { DietTag } from "@/lib/types";

export type OrderOccasion =
  | "team_lunch"
  | "office_celebration"
  | "employee_event"
  | "client_meeting"
  | "business_gathering"
  | "birthday"
  | "temple"
  | "wedding"
  | "other"
  | "";

export type OrderDraft = {
  occasion: OrderOccasion | string;
  event_date: string;
  event_time: string;
  adults: number | null;
  kids: number | null;
  diet: DietTag | "" | string;
  delivery_or_pickup: "delivery" | "pickup" | "";
  city: string;
  address: string;
  budget: string;
  setup_needs: string;
  meal: "lunch" | "dinner" | "brunch" | "";
  package_tier: "good" | "better" | "best" | "";
  confirmed: boolean;
  notes: string;
};

export type CartProposalLine = {
  menu_item_id: string;
  variant_id?: string;
  quantity: number;
  name: string;
  price: number;
  unit: string;
};

export type CartProposal = {
  diet?: DietTag | string;
  guest_count?: number;
  event_date?: string;
  notes?: string;
  replace: boolean;
  items: CartProposalLine[];
  summary: string;
};

export const EMPTY_ORDER_DRAFT: OrderDraft = {
  occasion: "",
  event_date: "",
  event_time: "",
  adults: null,
  kids: null,
  diet: "",
  delivery_or_pickup: "",
  city: "",
  address: "",
  budget: "",
  setup_needs: "",
  meal: "",
  package_tier: "",
  confirmed: false,
  notes: "",
};

const DIETS = new Set([
  "jain",
  "swaminarayan",
  "pushtimarg",
  "pure_vegetarian",
  "vegan",
  "italian",
]);

export function normalizeDiet(raw: string): DietTag | "" {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (DIETS.has(t)) return t as DietTag;
  if (t.includes("jain")) return "jain";
  if (t.includes("swaminarayan")) return "swaminarayan";
  if (t.includes("pushti")) return "pushtimarg";
  if (t.includes("vegan")) return "vegan";
  if (t.includes("italian")) return "italian";
  if (t.includes("pure") || t.includes("vegetarian")) return "pure_vegetarian";
  return "";
}

export function mergeOrderDraft(
  prev: OrderDraft,
  patch: Partial<OrderDraft>
): OrderDraft {
  const next: OrderDraft = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "" && k !== "notes") continue;
    (next as Record<string, unknown>)[k] = v;
  }
  if (patch.diet != null) next.diet = normalizeDiet(String(patch.diet)) || next.diet;
  if (patch.confirmed === true) next.confirmed = true;
  if (patch.confirmed === false) next.confirmed = false;
  return next;
}

/** Slots we try to collect naturally before a full cart proposal. */
export function missingOrderSlots(draft: OrderDraft): string[] {
  const missing: string[] = [];
  if (!draft.occasion) missing.push("occasion");
  if (!draft.event_date) missing.push("event_date");
  if (draft.adults == null && draft.kids == null) missing.push("headcount");
  if (!draft.diet) missing.push("diet");
  if (!draft.meal) missing.push("meal");
  if (!draft.delivery_or_pickup) missing.push("delivery_or_pickup");
  if (draft.delivery_or_pickup === "delivery" && !draft.city && !draft.address) {
    missing.push("city_or_address");
  }
  return missing;
}

export function headcountFromDraft(draft: OrderDraft): number {
  const a = draft.adults ?? 0;
  const k = draft.kids ?? 0;
  if (a + k > 0) return a + k;
  return 0;
}

export function formatOrderReadback(draft: OrderDraft): string {
  const guests =
    draft.adults != null || draft.kids != null
      ? `${draft.adults ?? 0} adults${draft.kids ? ` + ${draft.kids} kids` : ""}`
      : "headcount TBD";
  const lines = [
    `Occasion: ${draft.occasion || "—"}`,
    `When: ${draft.event_date || "—"}${draft.event_time ? ` ${draft.event_time}` : ""} (${draft.meal || "meal TBD"})`,
    `Guests: ${guests}`,
    `Diet: ${draft.diet || "—"}`,
    `Service: ${draft.delivery_or_pickup || "—"}${draft.city ? ` · ${draft.city}` : ""}`,
    draft.address ? `Address: ${draft.address}` : null,
    draft.budget ? `Budget: ${draft.budget}` : null,
    draft.setup_needs ? `Setup: ${draft.setup_needs}` : null,
    draft.package_tier ? `Package: ${draft.package_tier}` : null,
    draft.notes ? `Notes: ${draft.notes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildCartProposalFromPackage(
  draft: OrderDraft,
  packageLines: {
    name: string;
    quantity: number;
    price: number;
    menu_item_id?: string;
    variant_id?: string;
  }[]
): CartProposal {
  const items: CartProposalLine[] = [];
  for (const line of packageLines) {
    let menu_item_id = line.menu_item_id;
    let variant_id = line.variant_id;
    let name = line.name;
    let price = line.price;
    let unit = "tray";

    if (!menu_item_id) {
      const match = menuItems.find(
        (m) =>
          line.name.toLowerCase().includes(m.name.toLowerCase()) ||
          m.name.toLowerCase().includes(line.name.split(" (")[0].toLowerCase())
      );
      if (match) {
        menu_item_id = match.id;
        const labelMatch = line.name.match(/\(([^)]+)\)/);
        const v = labelMatch
          ? match.variants?.find((x) =>
              x.label.toLowerCase().includes(labelMatch[1].toLowerCase())
            )
          : match.variants?.[match.variants.length - 1];
        variant_id = v?.id;
        name = v ? `${match.name} (${v.label})` : match.name;
        price = v?.price ?? match.price;
        unit = v?.unit || match.unit;
      }
    }

    if (!menu_item_id) continue;
    const item = menuItems.find((m) => m.id === menu_item_id);
    if (!item) continue;
    const v = variant_id
      ? item.variants?.find((x) => x.id === variant_id)
      : undefined;
    items.push({
      menu_item_id: item.id,
      variant_id: v?.id,
      quantity: Math.max(1, line.quantity),
      name: v ? `${item.name} (${v.label})` : item.name,
      price: v?.price ?? item.price ?? price,
      unit: v?.unit || item.unit || unit,
    });
  }

  const guest_count = headcountFromDraft(draft) || undefined;
  const summary = `Proposed ${items.length} item(s) for ${guest_count || "your"} guests${draft.package_tier ? ` (${draft.package_tier} package)` : ""}.`;

  return {
    diet: draft.diet || undefined,
    guest_count,
    event_date: draft.event_date || undefined,
    notes: [
      draft.occasion && `Occasion: ${draft.occasion}`,
      draft.meal && `Meal: ${draft.meal}`,
      draft.setup_needs && `Setup: ${draft.setup_needs}`,
      draft.notes,
    ]
      .filter(Boolean)
      .join(" · "),
    replace: true,
    items,
    summary,
  };
}
