import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb, updateDb, uid } from "@/lib/store/local-db";
import type { CalendarBlock, CalendarBlockKind } from "@/lib/types";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const blocks = [...(db.calendar_blocks || [])].sort((a, b) =>
    a.date === b.date
      ? a.start_time.localeCompare(b.start_time)
      : a.date.localeCompare(b.date)
  );
  return NextResponse.json({
    blocks,
    settings: {
      lead_time_hours: db.settings.lead_time_hours ?? 48,
      max_guests_per_day: db.settings.max_guests_per_day ?? 200,
      hold_ttl_minutes: db.settings.hold_ttl_minutes ?? 120,
    },
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const date = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Valid date required" }, { status: 400 });
  }
  const kind = (body.kind || "blackout") as CalendarBlockKind;
  const block: CalendarBlock = {
    id: uid("cal"),
    date,
    start_time: String(body.start_time || "00:00"),
    end_time: String(body.end_time || "23:59"),
    kind,
    guest_count: Number(body.guest_count || 0),
    notes: body.notes ? String(body.notes) : null,
    status: "active",
    created_at: new Date().toISOString(),
  };
  await updateDb((d) => {
    d.calendar_blocks = d.calendar_blocks || [];
    d.calendar_blocks.push(block);
  });
  return NextResponse.json({ block });
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await updateDb((d) => {
    d.calendar_blocks = (d.calendar_blocks || []).filter((b) => b.id !== id);
  });
  return NextResponse.json({ ok: true });
}
