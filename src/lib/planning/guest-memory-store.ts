import { getDb, updateDb, uid } from "@/lib/store/local-db";
import {
  emptyGuestMemory,
  type GuestEventMemory,
  type MemoryOp,
  applyMemoryOps,
  type ApplyOpsResult,
} from "@/lib/planning/guest-memory";

export async function getGuestMemoryBySession(
  sessionId: string
): Promise<GuestEventMemory | null> {
  const db = await getDb();
  const list = db.guest_events || [];
  return list.find((g) => g.session_id === sessionId) || null;
}

export async function getOrCreateGuestMemory(input: {
  session_id: string;
  customer_email: string;
}): Promise<GuestEventMemory> {
  const existing = await getGuestMemoryBySession(input.session_id);
  if (existing) {
    if (
      input.customer_email &&
      existing.customer_email !== input.customer_email.toLowerCase().trim()
    ) {
      existing.customer_email = input.customer_email.toLowerCase().trim();
      await persistGuestMemory(existing);
    }
    return existing;
  }
  const memory = emptyGuestMemory({
    event_id: uid("gev"),
    session_id: input.session_id,
    customer_email: input.customer_email || "unknown@guest.local",
  });
  await persistGuestMemory(memory);
  return memory;
}

export async function persistGuestMemory(
  memory: GuestEventMemory
): Promise<void> {
  await updateDb((db) => {
    if (!db.guest_events) db.guest_events = [];
    const idx = db.guest_events.findIndex(
      (g) => g.event_id === memory.event_id || g.session_id === memory.session_id
    );
    if (idx >= 0) db.guest_events[idx] = memory;
    else db.guest_events.push(memory);
  });
}

export async function updateGuestMemoryOps(input: {
  session_id: string;
  customer_email: string;
  ops: MemoryOp[];
}): Promise<ApplyOpsResult> {
  const memory = await getOrCreateGuestMemory({
    session_id: input.session_id,
    customer_email: input.customer_email,
  });
  const result = applyMemoryOps(memory, input.ops || []);
  await persistGuestMemory(result.memory);
  return result;
}
