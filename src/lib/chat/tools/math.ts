import { menuItems } from "@/lib/data/menu-seed";
import { calcOrderTotals, round2 } from "@/lib/pricing";
import { getSettings } from "@/lib/repo";
import type { CartLine, MenuItem } from "@/lib/types";

export type MathOp =
  | "portions_for_headcount"
  | "trays_needed"
  | "order_total"
  | "compare_packages"
  | "buffer";

export type MathInput = {
  op: MathOp;
  adults?: number;
  kids?: number;
  headcount?: number;
  meal?: "lunch" | "dinner" | "brunch";
  appetite?: "light" | "standard" | "heavy";
  menu_item_id?: string;
  variant_id?: string;
  items?: { menu_item_id: string; variant_id?: string; quantity: number }[];
  miles?: number;
  setup?: boolean;
  buffer_percent?: number;
};

function effectiveHeadcount(
  adults: number,
  kids: number,
  meal: string,
  appetite: string
) {
  const kidFactor = meal === "dinner" ? 0.65 : 0.55;
  const appetiteFactor =
    appetite === "light" ? 0.85 : appetite === "heavy" ? 1.2 : 1;
  return Math.max(1, Math.ceil((adults + kids * kidFactor) * appetiteFactor));
}

function bestVariant(item: MenuItem, headcount: number) {
  const variants = item.variants?.filter((v) => v.serves && v.serves > 0) || [];
  if (!variants.length) {
    return {
      variant_id: undefined as string | undefined,
      label: item.unit || "each",
      price: item.price,
      serves: 10,
      quantity: Math.max(1, Math.ceil(headcount / 10)),
    };
  }
  // Prefer largest tray that doesn't massively overshoot, else largest
  const sorted = [...variants].sort((a, b) => (a.serves || 0) - (b.serves || 0));
  let chosen = sorted[sorted.length - 1];
  for (const v of sorted) {
    if ((v.serves || 0) >= headcount) {
      chosen = v;
      break;
    }
  }
  const serves = chosen.serves || 20;
  const quantity = Math.max(1, Math.ceil(headcount / serves));
  return {
    variant_id: chosen.id,
    label: chosen.label,
    price: chosen.price,
    serves,
    quantity,
  };
}

function findItem(id: string) {
  return menuItems.find((m) => m.id === id && m.is_available !== false);
}

export async function runCateringMath(input: MathInput) {
  const meal = input.meal || "dinner";
  const appetite = input.appetite || "standard";
  const adults = Math.max(0, Number(input.adults ?? input.headcount ?? 0));
  const kids = Math.max(0, Number(input.kids ?? 0));
  const headcount =
    input.headcount && input.headcount > 0
      ? Math.ceil(input.headcount)
      : effectiveHeadcount(adults || 1, kids, meal, appetite);

  if (input.op === "buffer") {
    const pct = Math.min(25, Math.max(5, Number(input.buffer_percent ?? 12)));
    const buffered = Math.ceil(headcount * (1 + pct / 100));
    return {
      ok: true,
      tool: "catering_math",
      op: input.op,
      headcount,
      buffer_percent: pct,
      buffered_headcount: buffered,
      summary: `For uncertain headcount, plan for ${buffered} guests (+${pct}% buffer on ${headcount}).`,
    };
  }

  if (input.op === "trays_needed") {
    if (!input.menu_item_id) {
      return { ok: false, error: "menu_item_id required" };
    }
    const item = findItem(input.menu_item_id);
    if (!item) return { ok: false, error: "Unknown or unavailable menu item" };
    let variant = item.variants?.find((v) => v.id === input.variant_id);
    const pick = variant
      ? {
          variant_id: variant.id,
          label: variant.label,
          price: variant.price,
          serves: variant.serves || 20,
          quantity: Math.max(1, Math.ceil(headcount / (variant.serves || 20))),
        }
      : bestVariant(item, headcount);
    return {
      ok: true,
      tool: "catering_math",
      op: input.op,
      headcount,
      item: {
        id: item.id,
        name: item.name,
        ...pick,
        line_total: round2(pick.price * pick.quantity),
      },
      summary: `${item.name}: ${pick.quantity}× ${pick.label} (serves ~${pick.serves} each) for ${headcount} guests ≈ $${round2(pick.price * pick.quantity)}.`,
    };
  }

  if (input.op === "order_total") {
    const settings = await getSettings();
    const lines: CartLine[] = [];
    for (const row of input.items || []) {
      const item = findItem(row.menu_item_id);
      if (!item) continue;
      const v = item.variants?.find((x) => x.id === row.variant_id);
      lines.push({
        menu_item_id: item.id,
        line_id: v ? `${item.id}:${v.id}` : item.id,
        variant_id: v?.id,
        name: v ? `${item.name} (${v.label})` : item.name,
        price: v?.price ?? item.price,
        quantity: Math.max(1, row.quantity),
        unit: v?.unit || item.unit,
      });
    }
    const totals = calcOrderTotals({
      items: lines,
      miles: Number(input.miles ?? 10),
      coupon: null,
      settings,
      setup: input.setup,
    });
    const setupPart = totals.setup_fee ? ` + on-site setup $${totals.setup_fee}` : "";
    return {
      ok: true,
      tool: "catering_math",
      op: input.op,
      lines,
      totals,
      summary: `Subtotal $${totals.subtotal} + delivery $${totals.delivery_fee}${setupPart} + tax $${totals.tax} = $${totals.total}.`,
    };
  }

  if (input.op === "compare_packages") {
    // Simple good/better/best using veg + rice + bread heuristics from catalog
    const veg =
      findItem("item-palak-paneer") ||
      menuItems.find((m) => m.category_id === "cat-vegetable-dishes");
    const rice =
      findItem("item-vegetable-pulao") ||
      menuItems.find((m) => m.category_id === "cat-rice-noodles");
    const bread =
      findItem("item-whole-wheat-rotis-with-ghee") ||
      menuItems.find((m) => m.category_id === "cat-breads-rotis");
    const dessert =
      findItem("item-gulabjamun") ||
      menuItems.find((m) => m.category_id === "cat-desserts");

    function tier(
      label: string,
      vegMult: number,
      withDessert: boolean,
      withExtraVeg: boolean
    ) {
      const lines: {
        name: string;
        quantity: number;
        price: number;
        serves?: number;
      }[] = [];
      let total = 0;
      if (veg) {
        const p = bestVariant(veg, Math.ceil(headcount * vegMult));
        lines.push({
          name: `${veg.name} (${p.label})`,
          quantity: p.quantity + (withExtraVeg ? 1 : 0),
          price: p.price,
          serves: p.serves,
        });
        total += p.price * (p.quantity + (withExtraVeg ? 1 : 0));
      }
      if (rice) {
        const p = bestVariant(rice, headcount);
        lines.push({
          name: `${rice.name} (${p.label})`,
          quantity: p.quantity,
          price: p.price,
          serves: p.serves,
        });
        total += p.price * p.quantity;
      }
      if (bread) {
        const p = bestVariant(bread, headcount);
        lines.push({
          name: `${bread.name} (${p.label})`,
          quantity: p.quantity,
          price: p.price,
          serves: p.serves,
        });
        total += p.price * p.quantity;
      }
      if (withDessert && dessert) {
        const p = bestVariant(dessert, headcount);
        lines.push({
          name: `${dessert.name} (${p.label})`,
          quantity: p.quantity,
          price: p.price,
          serves: p.serves,
        });
        total += p.price * p.quantity;
      }
      return { label, lines, food_subtotal: round2(total) };
    }

    const packages = [
      tier("Good", 1, false, false),
      tier("Better", 1, true, false),
      tier("Best", 1.15, true, true),
    ];
    return {
      ok: true,
      tool: "catering_math",
      op: input.op,
      headcount,
      meal,
      appetite,
      packages,
      summary: packages
        .map((p) => `${p.label}: ~$${p.food_subtotal} food`)
        .join(" · "),
    };
  }

  // portions_for_headcount (default)
  const eff = effectiveHeadcount(
    adults || headcount,
    kids,
    meal,
    appetite
  );
  const vegCount = Math.max(1, Math.ceil(eff / 25));
  const riceCount = Math.max(1, Math.ceil(eff / 30));
  const breadCount = Math.max(1, Math.ceil(eff / 25));
  const buffer = Math.ceil(eff * 1.1);

  return {
    ok: true,
    tool: "catering_math",
    op: "portions_for_headcount",
    adults,
    kids,
    meal,
    appetite,
    effective_headcount: eff,
    buffered_headcount: buffer,
    recommendation: {
      vegetable_trays_approx: vegCount,
      rice_trays_approx: riceCount,
      bread_packs_approx: breadCount,
      note: "Counts are planning guides using typical tray serves (~20–40). Confirm specific items with menu tools.",
    },
    summary: `For ${adults || headcount} adults${kids ? ` + ${kids} kids` : ""} (${meal}, ${appetite}): plan ~${vegCount} veg tray(s), ~${riceCount} rice, ~${breadCount} bread; buffer headcount ${buffer}.`,
  };
}
