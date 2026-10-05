import { getDb } from "@/lib/store/local-db";
import {
  getOrCreateGuestMemory,
  persistGuestMemory,
  updateGuestMemoryOps,
} from "@/lib/planning/guest-memory-store";
import {
  summarizeGuestMemory,
  type MemoryOp,
  type MemoryOpType,
} from "@/lib/planning/guest-memory";
import { filterMenuItems } from "@/lib/planning/menu-tags";
import { getChefSpecialties } from "@/lib/planning/chef-specialties";
import { matchFamousCombinations } from "@/lib/planning/famous-combinations";
import { buildPlan, menuRowsForTool } from "@/lib/planning/engine";
import { runCateringCalendar } from "@/lib/chat/tools/calendar";
import type { CartProposal } from "@/lib/chat/order-draft";

export type PlanningToolContext = {
  session_id: string;
  customer_email: string;
  cartProposal?: CartProposal | null;
  setCartProposal?: (p: CartProposal | null) => void;
  /** Live cart from the page when available */
  live_cart_items?: {
    menu_item_id: string;
    variant_id?: string;
    name?: string;
    quantity: number;
    unit_price?: number;
  }[];
  lead_phone?: string;
  lead_email?: string;
};

function asOps(raw: unknown): MemoryOp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const r = o as Record<string, unknown>;
      const op = String(r.op || "") as MemoryOpType;
      return {
        op,
        path: String(r.path || ""),
        key: r.key != null ? String(r.key) : undefined,
        value: r.value,
        message: r.message != null ? String(r.message) : undefined,
      } as MemoryOp;
    })
    .filter(Boolean) as MemoryOp[];
}

export async function runGetMenu(args: Record<string, unknown>) {
  const db = await getDb();
  const filters = {
    diet: args.diet != null ? String(args.diet) : undefined,
    jain_ok: args.jain_ok != null ? Boolean(args.jain_ok) : undefined,
    vegan: args.vegan != null ? Boolean(args.vegan) : undefined,
    kid_friendly:
      args.kid_friendly != null ? Boolean(args.kid_friendly) : undefined,
    spice_max: args.spice_max as "mild" | "medium" | "hot" | undefined,
    exclude_allergen:
      args.exclude_allergen != null
        ? String(args.exclude_allergen)
        : undefined,
    category_id:
      args.category_id != null ? String(args.category_id) : undefined,
    query: args.query != null ? String(args.query) : undefined,
    available_only: args.available_only != null ? Boolean(args.available_only) : true,
    limit: args.limit != null ? Number(args.limit) : 30,
  };
  const rows = filterMenuItems(db.menu_items || [], filters);
  const items = menuRowsForTool(rows);
  return {
    ok: true,
    count: items.length,
    items,
    summary: `Menu filter returned ${items.length} item(s).`,
  };
}

export async function runGetFamousCombinations(args: Record<string, unknown>) {
  const item_ids = Array.isArray(args.item_ids)
    ? args.item_ids.map((x) => String(x))
    : undefined;
  const hints = Array.isArray(args.hints)
    ? args.hints.map((x) => String(x))
    : args.diet
      ? [String(args.diet)]
      : undefined;
  const limit = args.limit != null ? Number(args.limit) : 6;
  const matches = matchFamousCombinations({ item_ids, hints, limit });
  const db = await getDb();
  const combinations = matches.map((m) => ({
    id: m.combo.id,
    name: m.combo.name,
    why: m.combo.why,
    tags: m.combo.tags,
    items: m.combo.item_ids.map((id) => {
      const item = db.menu_items.find((x) => x.id === id);
      return {
        id,
        name: item?.name || id,
        available: Boolean(item?.is_available),
        price: item?.price ?? null,
        category_id: item?.category_id || null,
      };
    }),
    score: m.score,
  }));
  return {
    ok: true,
    combinations,
    summary: `${combinations.length} famous combination(s). Use these pairings when suggesting menus — never invent combos.`,
  };
}

export async function runGetChefSpecialties(args: Record<string, unknown>) {
  const ids = Array.isArray(args.item_ids)
    ? args.item_ids.map((x) => String(x))
    : undefined;
  const specialties = getChefSpecialties(ids);
  const db = await getDb();
  const withPrices = specialties.map((s) => {
    const item = db.menu_items.find((m) => m.id === s.menu_item_id);
    return {
      ...s,
      available: Boolean(item?.is_available),
      price: item?.price ?? null,
      diet_tags: item?.diet_tags ?? [],
    };
  });
  return {
    ok: true,
    specialties: withPrices,
    summary: `${withPrices.length} chef specialty item(s) from catalog (do not invent others).`,
  };
}

export async function runUpdateGuestMemory(
  args: Record<string, unknown>,
  ctx: PlanningToolContext
) {
  const ops = asOps(args.ops);
  if (!ops.length) {
    return {
      ok: false,
      error: "ops array required",
      summary: "update_guest_memory needs ops.",
    };
  }
  const result = await updateGuestMemoryOps({
    session_id: ctx.session_id,
    customer_email: ctx.customer_email,
    ops,
  });
  return {
    ok: result.ok,
    applied: result.applied,
    errors: result.errors,
    conflicts: result.conflicts,
    clarifications: result.clarifications,
    memory_summary: summarizeGuestMemory(result.memory),
    memory: {
      event: result.memory.event,
      headcount: result.memory.headcount,
      requirement_groups: result.memory.requirement_groups,
      declined_suggestions: result.memory.declined_suggestions,
      conflicts: result.memory.conflicts,
      open_questions: result.memory.open_questions,
      timeline: result.memory.timeline,
    },
    summary: result.ok
      ? `Guest memory updated (${result.applied} op(s)). ${summarizeGuestMemory(result.memory)}`
      : `Guest memory partial/errors: ${result.errors.join("; ")}`,
  };
}

export async function runGetGuestMemory(ctx: PlanningToolContext) {
  const memory = await getOrCreateGuestMemory({
    session_id: ctx.session_id,
    customer_email: ctx.customer_email,
  });
  return {
    ok: true,
    memory_summary: summarizeGuestMemory(memory),
    memory: {
      event_id: memory.event_id,
      event: memory.event,
      headcount: memory.headcount,
      requirement_groups: memory.requirement_groups,
      declined_suggestions: memory.declined_suggestions,
      conflicts: memory.conflicts,
      open_questions: memory.open_questions,
      timeline: memory.timeline,
      preferences: memory.preferences,
      notes: memory.notes,
      chef_mentions: memory.chef_mentions,
    },
    summary: `Guest memory: ${summarizeGuestMemory(memory)}`,
  };
}

export async function runBuildPlan(
  args: Record<string, unknown>,
  ctx: PlanningToolContext
) {
  const db = await getDb();
  const memory = await getOrCreateGuestMemory({
    session_id: ctx.session_id,
    customer_email: ctx.customer_email,
  });

  const cartFromProposal =
    ctx.cartProposal?.items?.map((i) => ({
      menu_item_id: i.menu_item_id,
      variant_id: i.variant_id,
      name: i.name,
      quantity: i.quantity,
      unit_price: i.price,
    })) || [];
  const live = ctx.live_cart_items || [];
  const cart_items = live.length ? live : cartFromProposal;

  const replace =
    args.replace != null
      ? Boolean(args.replace)
      : args.mode === "validate"
        ? false
        : !cart_items.length;

  const prefer_item_ids = Array.isArray(args.prefer_item_ids)
    ? args.prefer_item_ids.map((x) => String(x))
    : undefined;
  const dish_count =
    args.dish_count != null && Number.isFinite(Number(args.dish_count))
      ? Number(args.dish_count)
      : undefined;
  const SWAP_ROLES = new Set([
    "appetizer",
    "chaat",
    "main",
    "dal",
    "starch",
    "bread",
    "salad",
    "dessert",
    "soup",
    "pizza",
    "side",
  ]);
  const swap_role = SWAP_ROLES.has(String(args.swap_role || "").trim().toLowerCase())
    ? (String(args.swap_role).trim().toLowerCase() as
        | "appetizer"
        | "chaat"
        | "main"
        | "dal"
        | "starch"
        | "bread"
        | "salad"
        | "dessert"
        | "soup"
        | "pizza"
        | "side")
    : undefined;
  const swap_item_id =
    args.swap_item_id != null ? String(args.swap_item_id).trim() : undefined;

  const plan = buildPlan({
    memory,
    catalog: db.menu_items || [],
    cart_items,
    replace,
    prefer_item_ids,
    dish_count,
    swap_role,
    swap_item_id,
  });

  if (plan.mode === "build" && plan.items.length) {
    memory.planned_menu = plan.items.map((i) => ({
      menu_item_id: i.menu_item_id,
      variant_id: i.variant_id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      reason: i.reason,
    }));
    memory.updated_at = new Date().toISOString();
    await persistGuestMemory(memory);
    ctx.setCartProposal?.({
      source: "plan",
      guest_count: memory.headcount.total ?? undefined,
      event_date: memory.event.date,
      notes: memory.event.occasion
        ? `Occasion: ${memory.event.occasion}`
        : undefined,
      replace: true,
      items: memory.planned_menu.map((l) => ({
        menu_item_id: l.menu_item_id,
        variant_id: l.variant_id,
        quantity: l.quantity,
        name: l.name,
        price: l.price,
        unit: l.unit || "tray",
      })),
      summary: `Planned menu · ${plan.items.length} dishes.`,
    });
  }

  return {
    ...plan,
    // Explicit for agent → UI lines path
    use_engine_lines: true,
  };
}

/** Wrap catering_calendar check_availability for capacity. */
export async function runCheckCapacity(
  args: Record<string, unknown>,
  ctx: PlanningToolContext
) {
  const memory = await getOrCreateGuestMemory({
    session_id: ctx.session_id,
    customer_email: ctx.customer_email,
  });
  const date =
    (args.date != null ? String(args.date) : "") ||
    memory.event.date ||
    undefined;
  const guest_count =
    args.guest_count != null
      ? Number(args.guest_count)
      : memory.headcount.total ?? undefined;

  const result = await runCateringCalendar({
    action: "check_availability",
    date,
    start_time:
      args.start_time != null
        ? String(args.start_time)
        : memory.event.meal_time || undefined,
    end_time: args.end_time != null ? String(args.end_time) : undefined,
    guest_count,
    lead_phone: ctx.lead_phone,
    lead_email: ctx.lead_email || ctx.customer_email,
    notes: args.notes != null ? String(args.notes) : undefined,
  });

  return {
    ...result,
    summary:
      (result as { summary?: string }).summary ||
      `Capacity check for ${date || "date?"} / ${guest_count ?? "?"} guests.`,
  };
}

export async function runPlanningTool(
  tool:
    | "get_menu"
    | "get_chef_specialties"
    | "get_famous_combinations"
    | "update_guest_memory"
    | "get_guest_memory"
    | "build_plan"
    | "check_capacity",
  args: Record<string, unknown>,
  ctx: PlanningToolContext
) {
  switch (tool) {
    case "get_menu":
      return runGetMenu(args);
    case "get_chef_specialties":
      return runGetChefSpecialties(args);
    case "get_famous_combinations":
      return runGetFamousCombinations(args);
    case "update_guest_memory":
      return runUpdateGuestMemory(args, ctx);
    case "get_guest_memory":
      return runGetGuestMemory(ctx);
    case "build_plan":
      return runBuildPlan(args, ctx);
    case "check_capacity":
      return runCheckCapacity(args, ctx);
    default:
      return { ok: false, error: "unknown planning tool" };
  }
}
