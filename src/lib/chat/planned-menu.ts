import type { CartProposal } from "@/lib/chat/order-draft";
import { buildPlan } from "@/lib/planning/engine";
import type { GuestEventMemory } from "@/lib/planning/guest-memory";
import {
  getOrCreateGuestMemory,
  persistGuestMemory,
} from "@/lib/planning/guest-memory-store";
import { getDb } from "@/lib/store/local-db";

function proposalFromMemory(memory: GuestEventMemory): CartProposal | null {
  const lines = memory.planned_menu || [];
  if (!lines.length) return null;
  return {
    source: "plan",
    guest_count: memory.headcount.total ?? undefined,
    event_date: memory.event.date,
    notes: memory.event.occasion
      ? `Occasion: ${memory.event.occasion}`
      : undefined,
    replace: true,
    items: lines.map((l) => ({
      menu_item_id: l.menu_item_id,
      variant_id: l.variant_id,
      quantity: Math.max(1, l.quantity),
      name: l.name,
      price: l.price,
      unit: l.unit || "tray",
    })),
    summary: `Planned menu · ${lines.length} dish${lines.length === 1 ? "" : "es"}.`,
  };
}

/** Last build_plan menu for this chat, rebuilt from guest memory when none was saved. */
export async function proposalFromLatestPlan(input: {
  session_id: string;
  customer_email?: string;
}): Promise<CartProposal | null> {
  if (!input.session_id) return null;
  const memory = await getOrCreateGuestMemory({
    session_id: input.session_id,
    customer_email: input.customer_email || "unknown@guest.local",
  });
  const saved = proposalFromMemory(memory);
  if (saved) return saved;
  if (!memory.headcount.total) return null;

  const db = await getDb();
  const plan = buildPlan({
    memory,
    catalog: db.menu_items || [],
    replace: true,
  });
  if (plan.mode !== "build" || !plan.items.length) return null;

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
  return proposalFromMemory(memory);
}
