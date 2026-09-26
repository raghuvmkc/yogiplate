import { runCateringMath } from "@/lib/chat/tools/math";
import {
  EMPTY_ORDER_DRAFT,
  buildCartProposalFromPackage,
  formatOrderReadback,
  headcountFromDraft,
  mergeOrderDraft,
  missingOrderSlots,
  type CartProposal,
  type OrderDraft,
} from "@/lib/chat/order-draft";

export type OrderToolAction =
  | "update_order_draft"
  | "get_order_draft"
  | "read_back"
  | "propose_cart"
  | "confirm_order_draft";

export type OrderToolInput = {
  action: OrderToolAction;
  patch?: Partial<OrderDraft>;
  tier?: "good" | "better" | "best";
  replace_cart?: boolean;
  confirmed?: boolean;
};

export type OrderToolContext = {
  draft: OrderDraft;
  setDraft: (d: OrderDraft) => void;
  setCartProposal: (p: CartProposal | null) => void;
};

export async function runOrderTool(
  input: OrderToolInput,
  ctx: OrderToolContext
) {
  const action = input.action || "get_order_draft";

  if (action === "update_order_draft") {
    const next = mergeOrderDraft(ctx.draft, {
      ...(input.patch || {}),
      confirmed: false,
    });
    ctx.setDraft(next);
    const missing = missingOrderSlots(next);
    return {
      ok: true,
      tool: "order_draft",
      action,
      draft: next,
      missing_slots: missing,
      ready_for_readback: missing.length <= 2,
      summary:
        missing.length === 0
          ? "Draft looks complete — call read_back next, then ask the guest to confirm."
          : `Updated draft. Still helpful to learn: ${missing.join(", ")}.`,
    };
  }

  if (action === "get_order_draft") {
    const missing = missingOrderSlots(ctx.draft);
    return {
      ok: true,
      tool: "order_draft",
      action,
      draft: ctx.draft,
      missing_slots: missing,
      summary: `Current draft missing: ${missing.join(", ") || "none"}.`,
    };
  }

  if (action === "read_back") {
    const missing = missingOrderSlots(ctx.draft);
    const text = formatOrderReadback(ctx.draft);
    return {
      ok: true,
      tool: "order_draft",
      action,
      draft: ctx.draft,
      missing_slots: missing,
      readback: text,
      summary: `Read this back to the guest and ask them to confirm before proposing the cart:\n${text}`,
    };
  }

  if (action === "propose_cart") {
    const tier = input.tier || ctx.draft.package_tier || "better";
    const headcount = headcountFromDraft(ctx.draft) || 20;
    const meal =
      ctx.draft.meal === "lunch" ||
      ctx.draft.meal === "brunch" ||
      ctx.draft.meal === "dinner"
        ? ctx.draft.meal
        : "dinner";

    const math = await runCateringMath({
      op: "compare_packages",
      headcount,
      adults: ctx.draft.adults ?? headcount,
      kids: ctx.draft.kids ?? 0,
      meal,
      appetite: "standard",
    });

    if (!math.ok || !("packages" in math)) {
      return {
        ok: false,
        tool: "order_draft",
        error: "Could not build package",
        summary: "catering_math compare_packages failed.",
      };
    }

    const packages = math.packages as {
      label: string;
      lines: { name: string; quantity: number; price: number }[];
      food_subtotal: number;
    }[];
    const chosen =
      packages.find((p) => p.label.toLowerCase() === String(tier).toLowerCase()) ||
      packages[1] ||
      packages[0];

    const draft = mergeOrderDraft(ctx.draft, {
      package_tier: tier as OrderDraft["package_tier"],
    });
    ctx.setDraft(draft);

    const proposal = buildCartProposalFromPackage(
      draft,
      chosen.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        price: l.price,
      }))
    );
    proposal.replace = input.replace_cart !== false;
    ctx.setCartProposal(proposal);

    return {
      ok: true,
      tool: "order_draft",
      action,
      draft,
      tier: chosen.label,
      food_subtotal: chosen.food_subtotal,
      cart_proposal: proposal,
      readback: formatOrderReadback(draft),
      summary: `${chosen.label} package (~$${chosen.food_subtotal} food). ${proposal.summary} Ask guest to confirm, then call confirm_order_draft.`,
    };
  }

  if (action === "confirm_order_draft") {
    if (input.confirmed === false) {
      const next = mergeOrderDraft(ctx.draft, { confirmed: false });
      ctx.setDraft(next);
      return {
        ok: true,
        tool: "order_draft",
        action,
        draft: next,
        summary: "Guest did not confirm — keep refining the draft.",
      };
    }
    const next = mergeOrderDraft(ctx.draft, { confirmed: true });
    ctx.setDraft(next);
    return {
      ok: true,
      tool: "order_draft",
      action,
      draft: next,
      cart_ready: true,
      summary:
        "Guest confirmed. Tell them the proposal will be added to Build order, and they can checkout on /order.",
    };
  }

  return {
    ok: false,
    error: "Unknown order_draft action",
    draft: ctx.draft || EMPTY_ORDER_DRAFT,
  };
}
