import { proposalFromLatestPlan } from "@/lib/chat/planned-menu";
import { fromCents, lineCents } from "@/lib/pricing";
import { runCateringMath } from "@/lib/chat/tools/math";
import { getOrCreateGuestMemory } from "@/lib/planning/guest-memory-store";
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
  /** Guest accepted the dish-by-dish readback. */
  menu_confirmed?: boolean;
  /** Use the short good/better/best package instead of the planned menu. */
  force_package?: boolean;
};

export type OrderToolContext = {
  draft: OrderDraft;
  setDraft: (d: OrderDraft) => void;
  setCartProposal: (p: CartProposal | null) => void;
  sessionId?: string;
  customerEmail?: string;
};

async function plannedMenuReadback(ctx: OrderToolContext): Promise<string> {
  if (!ctx.sessionId) return "";
  const memory = await getOrCreateGuestMemory({
    session_id: ctx.sessionId,
    customer_email: ctx.customerEmail || "",
  });
  const items = memory.planned_menu || [];
  if (!items.length) return "";
  return items
    .map((line, index) => {
      const why = line.reason ? ` — ${line.reason}` : "";
      return `${index + 1}. ${line.name} × ${line.quantity} ${line.unit}${why}`;
    })
    .join("\n");
}

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
    const addressNote = missing.includes("full_delivery_address")
      ? " Ask for the full delivery address: house or building number, street, city, and ZIP. A city name alone is not enough — store the street address in address, and the city in city."
      : "";
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
          : `Updated draft. Still helpful to learn: ${missing.join(", ")}.${addressNote}`,
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
    const menu = await plannedMenuReadback(ctx);
    const readback = menu
      ? `${text}\n\nDishes:\n${menu}`
      : text;
    return {
      ok: true,
      tool: "order_draft",
      action,
      draft: ctx.draft,
      missing_slots: missing,
      readback,
      summary: menu
        ? `Read the event details and every dish and tray size back, then wait for the guest to accept before propose_cart:\n${readback}`
        : `Read this back to the guest and ask them to confirm before proposing the cart:\n${text}`,
    };
  }

  if (action === "propose_cart") {
    const menu = await plannedMenuReadback(ctx);
    if (menu && input.menu_confirmed !== true && input.force_package !== true) {
      return {
        ok: true,
        held: true,
        tool: "order_draft",
        action,
        draft: ctx.draft,
        readback: menu,
        summary:
          "Do not place this menu yet. Read each dish and tray size back and wait. Call propose_cart again with menu_confirmed true only after the guest accepts. Do not rebuild the menu.",
      };
    }
    if (input.force_package !== true && ctx.sessionId) {
      const planned = await proposalFromLatestPlan({
        session_id: ctx.sessionId,
        customer_email: ctx.customerEmail,
      });
      if (planned?.items.length) {
        ctx.setCartProposal(planned);
        return {
          ok: true,
          tool: "order_draft",
          action,
          draft: ctx.draft,
          food_subtotal: fromCents(
            planned.items.reduce((sum, item) => sum + lineCents(item.price, item.quantity), 0)
          ),
          cart_proposal: planned,
          readback: formatOrderReadback(ctx.draft),
          summary: `Using all ${planned.items.length} dishes from the planned menu. create_quote must include every one of these lines.`,
        };
      }
    }

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
