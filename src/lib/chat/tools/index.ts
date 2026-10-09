import { z } from "zod";
import { runTimeContext } from "@/lib/chat/tools/time";
import { runCateringMath } from "@/lib/chat/tools/math";
import { runCateringCalendar } from "@/lib/chat/tools/calendar";
import { runOrderTool, type OrderToolContext } from "@/lib/chat/tools/order";
import { runFollowthroughTool } from "@/lib/chat/tools/followthrough";
import { runPlanningTool } from "@/lib/chat/tools/planning";
import type { CartProposal, OrderDraft } from "@/lib/chat/order-draft";
import type { ContactChannel } from "@/lib/types";
import {
  chefFormalName,
  chefWithTitle,
  getYogiPeople,
  handoffTeamPhrase,
} from "@/lib/people";

export const TOOL_NAMES = [
  "time_context",
  "catering_math",
  "catering_calendar",
  "order_draft",
  "followthrough",
  "get_menu",
  "get_chef_specialties",
  "get_famous_combinations",
  "update_guest_memory",
  "get_guest_memory",
  "build_plan",
  "check_capacity",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const PLANNING_TOOLS = new Set<ToolName>([
  "get_menu",
  "get_chef_specialties",
  "get_famous_combinations",
  "update_guest_memory",
  "get_guest_memory",
  "build_plan",
  "check_capacity",
]);

export function toolCatalogForPrompt(): string {
  const people = getYogiPeople();
  const chef = chefFormalName(people);
  const chefTitled = chefWithTitle(people);
  const team = handoffTeamPhrase(people);
  return `
TOOLS (call these — do not invent their results)
1) time_context — kitchen clock, lead time, lunch/dinner window.
   Args: event_date (YYYY-MM-DD), event_time (HH:mm optional), guest_count optional.
2) catering_math — portions, tray counts, totals, good/better/best packages.
   Args: op = portions_for_headcount | trays_needed | order_total | compare_packages | buffer;
   adults/kids/headcount, meal, appetite, menu_item_id, items[], miles, setup (true adds full on-site setup).
3) catering_calendar — capacity, blackouts, soft holds.
   Args: action = check_availability | create_hold | release_hold | list_day | get_lead_time_policy;
   date, guest_count, start_time, end_time, hold_id, lead_phone, lead_email, notes.
4) order_draft — structured catering order capture + cart proposal.
   Args: action = update_order_draft | get_order_draft | read_back | propose_cart | confirm_order_draft;
   patch: { occasion, event_date, event_time, adults, kids, diet, delivery_or_pickup, city, address, budget, setup_needs, special_requirements, meal, package_tier, notes };
   tier: good|better|best for propose_cart; menu_confirmed: true only after the guest accepts the dish readback; confirmed: true|false for confirm_order_draft.
5) followthrough — quote delivery + human handoff.
   Args: action = create_quote | send_quote | quote_status | request_human;
   send_email (default true), send_sms (default true); quote_id for send/status;
   reason optional for request_human.
   create_quote / send_quote emails AND texts the guest the quote link.
   request_human emails + texts ${team} — then tell the guest you forwarded the summary and they will be contacted.
   Requires a cart proposal (order_draft propose_cart) before create_quote.
6) update_guest_memory — structured guest/event facts (source of truth for planning).
   Args: ops: [{op: add|update|remove|flag_conflict|ask_clarification, path, key?, value?, message?}].
   Paths: event, headcount, headcount.segments, requirement_groups, timeline, declined_suggestions, preferences, notes.
   Examples: {op:"update",path:"headcount",value:25}; {op:"update",path:"requirement_groups",key:"jain",value:3};
   {op:"update",path:"requirement_groups",key:"allergy",value:{count:1,allergen:"cashew"}};
   Corrections upsert (Jain 2→3 replaces, does not duplicate). Max 2 clarifying questions per turn.
7) get_guest_memory — read canonical guest memory.
8) get_menu — filter catalog by diet/allergy/kid tags. Args: diet, jain_ok, vegan, kid_friendly, spice_max, exclude_allergen, query, limit.
   Empty allergens on an item = unknown → excluded when filtering by allergy.
9) get_chef_specialties — ${chefTitled} / Stone Craft signatures only (never invent). Args: item_ids? optional filter.
10) get_famous_combinations — classic catering pairings from our catalog (chole-bhature, pav bhaji, pani poori+dahi vada, rajma-chawal, paneer+roti+rice, etc.).
    Args: item_ids? (seed from cart), hints? (vegan|jain|italian|pizza|party|lunch…), limit?
    Use these when suggesting menus. Never invent combinations. Never recommend appetizer-only as a full meal.
11) build_plan — deterministic plan from guest memory (qty/prices/reason from code). Uses famous combos + balanced roles.
    Args: replace (bool), prefer_item_ids[], dish_count (number), mode build|validate, swap_role (bread|main|dessert|starch|appetizer|dal|pizza), swap_item_id.
    Each line includes reason. Paraphrase that reason. Do not invent a dish, price, or claim.
    If the guest asks for a number of dishes (for example 7), pass dish_count and store that number in preferences. Return every dish — never drop one to fit a shorter list.
    If cart already has items and replace is false: validates coverage (±30%) and returns notes — does not replace.
    To change one part of an existing menu, pass swap_role (and swap_item_id if they named the dish). Do not set replace true for a swap.
    If event.budget is set, engine fits cost without compromising guest satisfaction.
    Copy engine lines/lines_total/lines_title/reason into your answer JSON — do not invent prices. The quotation uses this full menu. Load menu-recommend before you present it.
12) check_capacity — wraps calendar availability using memory date/headcount when args omitted.

PLANNING FLOW
- discovery → profiling → clarifications → plan → revisions → confirm.
- Extract facts every turn via update_guest_memory (headcount, Jain/vegan, allergies, kids, meal time, budget).
- Warm profiling; max 2 questions/turn; catch-all reminder before finalize; never pressure.
- Advise never force: if guest declines a dish, add to declined_suggestions and never re-push.
- Famous combos: call get_famous_combinations (or rely on build_plan) — e.g. complete poori with chole; chaat as starters only beside mains/rice.
- Never propose four appetizers as the whole menu for a seated meal.
- Budget: update_guest_memory event.budget then build_plan — never randomly drop items yourself.
- Timing: ask meal time; build_plan schedules ~20 min before when no timeline.
- Chef: mention specialties at most twice per conversation; only names from get_chef_specialties.
- Severe allergy / unknown kitchen separation → request_human escalate; never invent allergen safety.
- After enough facts: load menu-recommend, call build_plan, then present numbered lines and each line’s reason. Two or three sentences first: occasion, balance, and one reason a guest would notice. Say “I’ll help you choose.” Never say “we’ll plan.”

ORDER FLOW
- Collect slots naturally: occasion → date/time → headcount → diet → delivery/pickup → full delivery address → special_requirements.
- Delivery address must be the street address: house or building number, street, city, and ZIP. Store that in patch.address. Store the city separately in patch.city. Never put only a city name in address. If the guest gives only a city, ask for the street address before create_quote. Pickup may use city only.
- REQUIRED: ask special requirements before propose_cart / create_quote — allergies, utensils/plates, buffet vs plated, warming trays, religious notes, kid-meal notes, access/parking — or store “none”. Patch order_draft.special_requirements (setup_needs for serving/setup).
- After useful facts: order_draft update_order_draft AND update_guest_memory.
- When the menu is ready: order_draft read_back, say each dish and tray size, and wait.
- After they accept that readback: propose_cart with menu_confirmed true, then confirm_order_draft.
- A change to one role (bread, main, dessert, rice) is build_plan swap_role, not a new menu. A declined dish stays declined.
- For quote / deposit: followthrough create_quote after build_plan. The quotation includes every planned dish, plus time, address, and special requests. When guest asks to send the quote → create_quote or send_quote (email + SMS). Do not replace the planned menu with a shorter package. In the reply, say the quotation was emailed. Never read or type the quote URL.
- Guest wants a person / manager / owner call → followthrough request_human, then confirm you forwarded the summary to ${team}.
- Site can also “Add to Build order”; guest finishes checkout on /order.

When to call
- Guest facts (allergies, Jain/vegan counts, headcount…) → update_guest_memory. Never invent headcount/diet/date.
- Menu ideas / “best for vegan” → load menu-recommend, then get_famous_combinations + build_plan (not random appetizer lists). Say the tool’s why or reason.
- Chef specials → get_chef_specialties (then build_plan prefer_item_ids if guest wants).
- Any date/timing → time_context AND check_capacity or catering_calendar.
- Headcount / trays → catering_math or build_plan.
- Order details / cart → order_draft.
- Quote / deposit / “send me the quote” / “text me the quote” → followthrough create_quote or send_quote.
- Speak with a person / manager / ${people.chefName} / ${people.managerName} / call me → followthrough request_human.
- If time_context.meets_lead_time is false: must check with ${chef}; use request_human; do not promise.

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
  messages?: { role: string; content: string }[];
  quoteUrl?: string | null;
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
        | "get_famous_combinations"
        | "update_guest_memory"
        | "get_guest_memory"
        | "build_plan"
        | "check_capacity",
      args,
      {
        session_id: ctx.chat_session_id || "anon",
        customer_email: ctx.lead_email || "unknown@guest.local",
        cartProposal: ctx.cartProposal,
        setCartProposal: ctx.setCartProposal,
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
      setup: args.setup === true || args.setup === "true",
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
        menu_confirmed:
          args.menu_confirmed != null ? Boolean(args.menu_confirmed) : undefined,
        force_package:
          args.force_package != null ? Boolean(args.force_package) : undefined,
      },
      {
        draft: ctx.orderDraft,
        setDraft: ctx.setOrderDraft,
        setCartProposal: ctx.setCartProposal,
        sessionId: ctx.chat_session_id,
        customerEmail: ctx.lead_email,
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
        send_sms: args.send_sms != null ? Boolean(args.send_sms) : undefined,
        reason: args.reason ? String(args.reason) : undefined,
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
        messages: ctx.messages,
        quoteUrl: ctx.quoteUrl,
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
