import { getDb, updateDb, uid } from "@/lib/store/local-db";
import type { CalendarBlock } from "@/lib/types";

export type CalendarAction =
  | "check_availability"
  | "create_hold"
  | "release_hold"
  | "list_day"
  | "get_lead_time_policy"
  | "add_blackout";

export type CalendarInput = {
  action: CalendarAction;
  date?: string;
  start_time?: string;
  end_time?: string;
  guest_count?: number;
  hold_id?: string;
  lead_phone?: string;
  lead_email?: string;
  notes?: string;
  days_ahead?: number;
};

function todayLA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function purgeExpired(blocks: CalendarBlock[]) {
  const now = Date.now();
  let changed = false;
  for (const b of blocks) {
    if (
      b.kind === "hold" &&
      b.status === "active" &&
      b.expires_at &&
      new Date(b.expires_at).getTime() < now
    ) {
      b.status = "expired";
      changed = true;
    }
  }
  return changed;
}

function dayGuests(blocks: CalendarBlock[], date: string) {
  return blocks
    .filter(
      (b) =>
        b.date === date &&
        b.status === "active" &&
        (b.kind === "order" || b.kind === "hold" || b.kind === "blocked")
    )
    .reduce((n, b) => n + (b.guest_count || 0), 0);
}

function hasBlackout(blocks: CalendarBlock[], date: string) {
  return blocks.some(
    (b) => b.date === date && b.status === "active" && b.kind === "blackout"
  );
}

export async function runCateringCalendar(input: CalendarInput) {
  const db = await getDb();
  if (!db.calendar_blocks) db.calendar_blocks = [];
  const settings = db.settings;
  const maxGuests = settings.max_guests_per_day ?? 200;
  const holdTtl = settings.hold_ttl_minutes ?? 120;
  const leadHours = settings.lead_time_hours ?? 48;

  const expired = await purgeExpired(db.calendar_blocks);
  if (expired) {
    await updateDb((d) => {
      d.calendar_blocks = db.calendar_blocks;
    });
  }

  if (input.action === "get_lead_time_policy") {
    return {
      ok: true,
      tool: "catering_calendar",
      action: input.action,
      lead_time_hours: leadHours,
      max_guests_per_day: maxGuests,
      hold_ttl_minutes: holdTtl,
      timezone: "America/Los_Angeles",
      summary: `Lead time ${leadHours}h · daily capacity ~${maxGuests} guests · holds last ${holdTtl} min.`,
    };
  }

  if (input.action === "list_day") {
    const date = input.date || todayLA();
    const blocks = (db.calendar_blocks || []).filter(
      (b) => b.date === date && b.status === "active"
    );
    return {
      ok: true,
      tool: "catering_calendar",
      action: input.action,
      date,
      blocks,
      guests_booked: dayGuests(db.calendar_blocks || [], date),
      max_guests_per_day: maxGuests,
      summary:
        blocks.length === 0
          ? `${date}: no active bookings or blackouts.`
          : `${date}: ${blocks.length} block(s), ~${dayGuests(db.calendar_blocks || [], date)} guests committed.`,
    };
  }

  if (input.action === "release_hold") {
    if (!input.hold_id) return { ok: false, error: "hold_id required" };
    let found = false;
    await updateDb((d) => {
      d.calendar_blocks = d.calendar_blocks || [];
      const b = d.calendar_blocks.find((x) => x.id === input.hold_id);
      if (b && b.kind === "hold") {
        b.status = "released";
        found = true;
      }
    });
    return {
      ok: found,
      tool: "catering_calendar",
      action: input.action,
      summary: found ? `Hold ${input.hold_id} released.` : "Hold not found.",
    };
  }

  if (input.action === "add_blackout") {
    const date = input.date;
    if (!date) return { ok: false, error: "date required" };
    const block: CalendarBlock = {
      id: uid("cal"),
      date,
      start_time: input.start_time || "00:00",
      end_time: input.end_time || "23:59",
      kind: "blackout",
      guest_count: 0,
      notes: input.notes || "Blackout",
      status: "active",
      created_at: new Date().toISOString(),
    };
    await updateDb((d) => {
      d.calendar_blocks = d.calendar_blocks || [];
      d.calendar_blocks.push(block);
    });
    return {
      ok: true,
      tool: "catering_calendar",
      action: input.action,
      block,
      summary: `Blackout added for ${date}.`,
    };
  }

  if (input.action === "create_hold") {
    const date = input.date;
    if (!date) return { ok: false, error: "date required" };
    const guest_count = Math.max(1, Number(input.guest_count || 1));
    if (hasBlackout(db.calendar_blocks || [], date)) {
      return {
        ok: false,
        tool: "catering_calendar",
        error: "Date is blacked out",
        summary: `${date} is unavailable (blackout).`,
      };
    }
    const booked = dayGuests(db.calendar_blocks || [], date);
    if (booked + guest_count > maxGuests) {
      return {
        ok: false,
        tool: "catering_calendar",
        error: "Over capacity",
        remaining_capacity: Math.max(0, maxGuests - booked),
        summary: `${date} cannot hold ${guest_count} more guests (capacity ${maxGuests}, booked ${booked}).`,
      };
    }
    const block: CalendarBlock = {
      id: uid("hold"),
      date,
      start_time: input.start_time || "11:00",
      end_time: input.end_time || "14:00",
      kind: "hold",
      guest_count,
      lead_phone: input.lead_phone || null,
      lead_email: input.lead_email || null,
      notes: input.notes || "Chat hold",
      status: "active",
      expires_at: new Date(Date.now() + holdTtl * 60_000).toISOString(),
      created_at: new Date().toISOString(),
    };
    await updateDb((d) => {
      d.calendar_blocks = d.calendar_blocks || [];
      d.calendar_blocks.push(block);
    });
    return {
      ok: true,
      tool: "catering_calendar",
      action: input.action,
      hold: block,
      summary: `Soft hold ${block.id} on ${date} for ${guest_count} guests (expires in ${holdTtl} min). Not a confirmed order.`,
    };
  }

  // check_availability (default)
  const date = input.date || todayLA();
  const guest_count = Math.max(0, Number(input.guest_count || 0));
  const booked = dayGuests(db.calendar_blocks || [], date);
  const blackout = hasBlackout(db.calendar_blocks || [], date);
  const remaining = Math.max(0, maxGuests - booked);
  const ok = !blackout && (guest_count === 0 || guest_count <= remaining);

  const alternates: string[] = [];
  if (!ok) {
    for (let i = 1; i <= (input.days_ahead || 14); i++) {
      const alt = addDays(date, i);
      if (hasBlackout(db.calendar_blocks || [], alt)) continue;
      const g = dayGuests(db.calendar_blocks || [], alt);
      if (guest_count <= maxGuests - g) {
        alternates.push(alt);
        if (alternates.length >= 3) break;
      }
    }
  }

  const conflicts = (db.calendar_blocks || []).filter(
    (b) => b.date === date && b.status === "active"
  );

  return {
    ok,
    tool: "catering_calendar",
    action: "check_availability",
    date,
    guest_count,
    blackout,
    guests_booked: booked,
    remaining_capacity: remaining,
    max_guests_per_day: maxGuests,
    conflicts: conflicts.map((c) => ({
      id: c.id,
      kind: c.kind,
      guest_count: c.guest_count,
      start_time: c.start_time,
      end_time: c.end_time,
      notes: c.notes,
    })),
    suggested_alternates: alternates,
    summary: blackout
      ? `${date} is blacked out. Try: ${alternates.join(", ") || "ask for another week"}.`
      : ok
        ? `${date} looks open for ~${guest_count || "your"} guests (capacity left ~${remaining}).`
        : `${date} is too full for ${guest_count} guests (${booked} already booked). Alternates: ${alternates.join(", ") || "none in next 2 weeks"}.`,
  };
}
