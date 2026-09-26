import { z } from "zod";
import { runTimeContext } from "@/lib/chat/tools/time";
import { runCateringMath } from "@/lib/chat/tools/math";
import { runCateringCalendar } from "@/lib/chat/tools/calendar";
import { runOrderTool, type OrderToolContext } from "@/lib/chat/tools/order";
import { runFollowthroughTool } from "@/lib/chat/tools/followthrough";
import { runPlanningTool } from "@/lib/chat/tools/planning";
import type { CartProposal, OrderDraft } from "@/lib/chat/order-draft";
import type { ContactChannel } from "@/lib/types";

export const TOOL_NAMES = [
  "time_context",
  "catering_math",
  "catering_calendar",
  "order_draft",
  "followthrough",
  "get_menu",
  "get_chef_specialties",
  "update_guest_memory",
  "get_guest_memory",
  "build_plan",
  "check_capacity",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const PLANNING_TOOLS = new Set<ToolName>([
  "get_menu",
  "get_chef_specialties",
  "update_guest_memory",
  "get_guest_memory",
  "build_plan",
  "check_capacity",
]);

export function toolCatalogForPrompt(): string {
  return `
TOOLS (call these — do not invent their results)
1) time_context — kitchen clock, lead time, lunch/dinner window.
   Args: event_date (YYYY-MM-DD), event_time (HH:mm optional), guest_count optional.
2) catering_math — portions, tray counts, totals, good/better/best packages.
   Args: op = portions_for_headcount | trays_needed | order_total | compare_packages | buffer;
   adults/kids/headcount, meal, appetite, menu_item_id, items[], miles.
3) catering_calendar — capacity, blackouts, soft holds.
   Args: action = check_availability | create_hold | release_hold | list_day | get_lead_time_policy;
   date, guest_count, start_time, end_time, hold_id, lead_phone, lead_email, notes.
4) order_draft — structured catering order capture + cart proposal.
   Args: action = update_order_draft | get_order_draft | read_back | propose_cart | confirm_order_draft;
   patch: { occasion, event_date, event_time, adults, kids, diet, delivery_or_pickup, city, address, budget, setup_needs, meal, package_tier, notes };
   tier: good|better|best for propose_cart; confirmed: true|false for confirm_order_draft.
5) followthrough — email quote, deposit link, reminder schedule.
   Args: action = create_quote | send_quote | quote_status;
   send_email (default true); quote_id for send/status.
   Requires a cart proposal (order_draft propose_cart) first.
6) update_guest_memory — structured guest/event facts (source of truth for planning).
   Args: ops: [{op: add|update|remove|flag_conflict|ask_clarification, path, key?, value?, message?}].
   Paths: event, headcount, headcount.segments, requirement_groups, timeline, declined_suggestions, preferences, notes.
   Examples: {op:"update",path:"headcount",value:25}; {op:"update",path:"requirement_groups",key:"jain",value:3};
   {op:"update",path:"requirement_groups",key:"allergy",value:{count:1,allergen:"cashew"}};
   Corrections upsert (Jain 2→3 replaces, does not duplicate). Max 2 clarifying questions per turn.
7) get_guest_memory — read canonical guest memory.
8) get_menu — filter catalog by diet/allergy/kid tags. Args: diet, jain_ok, vegan, kid_friendly, spice_max, exclude_allergen, query, limit.
   Empty allergens on an item = unknown → excluded when filtering by allergy.
9) get_chef_specialties — Mr. Radhavallabh / Stone Craft signatures only (never invent). Args: item_ids? optional filter.
10) build_plan — deterministic plan from guest memory (qty/prices from code). Args: replace (bool), prefer_item_ids[], mode build|validate.
    If cart already has items and replace is false: validates coverage (±30%) and returns notes — does not replace.
    If event.budget is set, engine fits cost without compromising guest satisfaction (extras/dessert first; keep mains+starch, kids, dedicated trays, variety; prefer over-budget warning to a disappointing meal).
    Copy engine lines/lines_total/lines_title into your answer JSON — do not invent prices.
11) check_capacity — wraps calendar availability using memory date/headcount when args omitted.

PLANNING FLOW
- discovery → profiling → clarifications → plan → revisions → confirm.
- Extract facts every turn via update_guest_memory (headcount, Jain/vegan, allergies, kids, meal time, budget).
- Warm profiling; max 2 questions/turn; catch-all reminder before finalize; never pressure.
- Advise never force: if guest declines a dish, add to declined_suggestions and never re-push.
- Budget: update_guest_memory event.budget then build_plan — never randomly drop items yourself.
- Timing: ask meal time; build_plan schedules ~20 min before when no timeline.
- Chef: mention specialties at most twice per conversation; only names from get_chef_specialties.
- Severe allergy / unknown kitchen separation → WhatsApp escalate; never invent allergen safety.
- After enough facts: build_plan, then present numbered lines from the tool.

ORDER FLOW
- Collect slots naturally: occasion → date/time → headcount → diet → delivery/pickup → city.
- After useful facts: order_draft update_order_draft AND update_guest_memory.
- When mostly complete: order_draft read_back → guest confirms → propose_cart → confirm_order_draft.
- For email quote / deposit: followthrough create_quote (after propose_cart).
- Site can also “Add to Build order”; guest finishes checkout on /order.

When to call
- Guest facts (nephew allergic, 3 Jain, 25 vegan…) → update_guest_memory.
- Menu ideas / “best for vegan” → get_menu and/or build_plan.
- Chef specials → get_chef_specialties (then build_plan prefer_item_ids if guest wants).
- Any date/timing → time_context AND check_capacity or catering_calendar.
- Headcount / trays → catering_math or build_plan.
- Order details / cart → order_draft.
- Quote / deposit / email → followthrough.
- If time_context.meets_lead_time is false: must check with Mr. Radhavallabh; offer WhatsApp; do not promise.

Tool call JSON:
{"type":"tool_call","tool":"build_plan","args":{"replace":true}}
`.trim();
}

const ToolCallSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.enum(TOOL_NAMES),
  args: z.record(z.string(), z.unknown()).optional().default({}),
});

export function parseToolCall(
  parsed: Record<string, unknown>
): { tool: ToolName; args: Record<string, unknown> } | null {
  const type = String(parsed.type || parsed.action || "").toLowerCase();
  if (type !== "tool_call" && type !== "call_tool") return null;
  const tool = String(parsed.tool || parsed.name || "");
  if (!TOOL_NAMES.includes(tool as ToolName)) return null;
  const args =
    (parsed.args as Record<string, unknown>) ||
    (parsed.arguments as Record<string, unknown>) ||
    {};
  const checked = ToolCallSchema.safeParse({
    type: "tool_call",
    tool,
    args,
  });
  if (!checked.success) return null;
  return { tool: checked.data.tool, args: checked.data.args };
}

export type ChatToolContext = {
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  lead_time_hours?: number;
  orderDraft: OrderDraft;
  setOrderDraft: (d: OrderDraft) => void;
  cartProposal: CartProposal | null;
  setCartProposal: OrderToolContext["setCartProposal"];
  channel?: ContactChannel;
  chat_session_id?: string;
  lastQuoteId?: string | null;
  setLastQuoteId?: (id: string) => void;
  live_cart_items?: {
    menu_item_id: string;
    variant_id?: string;
    name?: string;
    quantity: number;
    unit_price?: number;
  }[];
};

export async function executeChatTool(
  tool: ToolName,
  args: Record<string, unknown>,
  ctx: ChatToolContext
) {
  if (PLANNING_TOOLS.has(tool)) {
    return runPlanningTool(
      tool as
        | "get_menu"
        | "get_chef_specialties"
        | "update_guest_memory"
        | "get_guest_memory"
        | "build_plan"
        | "check_capacity",
      args,
      {
        session_id: ctx.chat_session_id || "anon",
        customer_email: ctx.lead_email || "unknown@guest.local",
        cartProposal: ctx.cartProposal,
        live_cart_items: ctx.live_cart_items,
        lead_phone: ctx.lead_phone,
        lead_email: ctx.lead_email,
      }
    );
  }
  if (tool === "time_context") {
    return runTimeContext({
      event_date: args.event_date ? String(args.event_date) : undefined,
      event_time: args.event_time ? String(args.event_time) : undefined,
      guest_count:
        args.guest_count != null ? Number(args.guest_count) : undefined,
      timezone: args.timezone ? String(args.timezone) : undefined,
      lead_time_hours:
        args.lead_time_hours != null
          ? Number(args.lead_time_hours)
          : ctx.lead_time_hours,
    });
  }
  if (tool === "catering_math") {
    return runCateringMath({
      op: (args.op as "portions_for_headcount") || "portions_for_headcount",
      adults: args.adults != null ? Number(args.adults) : undefined,
      kids: args.kids != null ? Number(args.kids) : undefined,
      headcount: args.headcount != null ? Number(args.headcount) : undefined,
      meal: args.meal as "lunch" | "dinner" | "brunch" | undefined,
      appetite: args.appetite as "light" | "standard" | "heavy" | undefined,
      menu_item_id: args.menu_item_id
        ? String(args.menu_item_id)
        : undefined,
      variant_id: args.variant_id ? String(args.variant_id) : undefined,
      items: Array.isArray(args.items)
        ? (args.items as {
            menu_item_id: string;
            variant_id?: string;
            quantity: number;
          }[])
        : undefined,
      miles: args.miles != null ? Number(args.miles) : undefined,
      buffer_percent:
        args.buffer_percent != null ? Number(args.buffer_percent) : undefined,
    });
  }
  if (tool === "order_draft") {
    return runOrderTool(
      {
        action: (args.action as "update_order_draft") || "get_order_draft",
        patch: (args.patch as Partial<OrderDraft>) || undefined,
        tier: args.tier as "good" | "better" | "best" | undefined,
        replace_cart:
          args.replace_cart != null ? Boolean(args.replace_cart) : undefined,
        confirmed:
          args.confirmed != null ? Boolean(args.confirmed) : undefined,
      },
      {
        draft: ctx.orderDraft,
        setDraft: ctx.setOrderDraft,
        setCartProposal: ctx.setCartProposal,
      }
    );
  }
  if (tool === "followthrough") {
    return runFollowthroughTool(
      {
        action: (args.action as "create_quote") || "create_quote",
        quote_id: args.quote_id ? String(args.quote_id) : undefined,
        send_email:
          args.send_email != null ? Boolean(args.send_email) : undefined,
      },
      {
        lead: {
          name: ctx.lead_name || "",
          email: ctx.lead_email || "",
          phone: ctx.lead_phone || "",
        },
        draft: ctx.orderDraft,
        cartProposal: ctx.cartProposal,
        channel: ctx.channel,
        chat_session_id: ctx.chat_session_id,
        lastQuoteId: ctx.lastQuoteId,
        setLastQuoteId: ctx.setLastQuoteId,
      }
    );
  }
  return runCateringCalendar({
    action: (args.action as "check_availability") || "check_availability",
    date: args.date ? String(args.date) : undefined,
    start_time: args.start_time ? String(args.start_time) : undefined,
    end_time: args.end_time ? String(args.end_time) : undefined,
    guest_count: args.guest_count != null ? Number(args.guest_count) : undefined,
    hold_id: args.hold_id ? String(args.hold_id) : undefined,
    lead_phone: args.lead_phone
      ? String(args.lead_phone)
      : ctx.lead_phone,
    lead_email: args.lead_email
      ? String(args.lead_email)
      : ctx.lead_email,
    notes: args.notes ? String(args.notes) : undefined,
    days_ahead: args.days_ahead != null ? Number(args.days_ahead) : undefined,
  });
}
