import { z } from "zod";
import { runTimeContext } from "@/lib/chat/tools/time";
import { runCateringMath } from "@/lib/chat/tools/math";
import { runCateringCalendar } from "@/lib/chat/tools/calendar";

export const TOOL_NAMES = [
  "time_context",
  "catering_math",
  "catering_calendar",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

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

When to call
- Any date/timing / "can you do Saturday?" → time_context AND catering_calendar check_availability.
- Headcount / enough food / how many trays → catering_math.
- Never invent prices, tray counts, lead times, or capacity.

Tool call JSON:
{"type":"tool_call","tool":"time_context","args":{"event_date":"2026-10-12","event_time":"18:30"}}
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

export async function executeChatTool(
  tool: ToolName,
  args: Record<string, unknown>,
  ctx?: { lead_phone?: string; lead_email?: string; lead_time_hours?: number }
) {
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
          : ctx?.lead_time_hours,
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
  // catering_calendar
  return runCateringCalendar({
    action: (args.action as "check_availability") || "check_availability",
    date: args.date ? String(args.date) : undefined,
    start_time: args.start_time ? String(args.start_time) : undefined,
    end_time: args.end_time ? String(args.end_time) : undefined,
    guest_count: args.guest_count != null ? Number(args.guest_count) : undefined,
    hold_id: args.hold_id ? String(args.hold_id) : undefined,
    lead_phone: args.lead_phone
      ? String(args.lead_phone)
      : ctx?.lead_phone,
    lead_email: args.lead_email
      ? String(args.lead_email)
      : ctx?.lead_email,
    notes: args.notes ? String(args.notes) : undefined,
    days_ahead: args.days_ahead != null ? Number(args.days_ahead) : undefined,
  });
}
