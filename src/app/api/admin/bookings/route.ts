import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getCateringBooking,
  listCateringBookings,
  updateCateringBooking,
  upsertCateringBooking,
} from "@/lib/calendar-bookings";
import type { CateringBookingStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const bookings = await listCateringBookings({ from, to, q });
  return NextResponse.json(
    { bookings },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const event_date = String(body.event_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return NextResponse.json({ error: "Valid event_date required" }, { status: 400 });
  }
  const created = await upsertCateringBooking({
    event_date,
    event_time: body.event_time ? String(body.event_time) : null,
    customer_name: String(body.customer_name || "Guest"),
    customer_email: String(body.customer_email || ""),
    customer_phone: String(body.customer_phone || ""),
    status: (body.status as CateringBookingStatus) || "unconfirmed",
    draft: {
      occasion: body.occasion ? String(body.occasion) : "",
      diet: body.diet ? String(body.diet) : "",
      meal: (body.meal as "lunch") || "",
      delivery_or_pickup: (body.delivery_or_pickup as "delivery") || "",
      city: body.city ? String(body.city) : "",
      address: body.address ? String(body.address) : "",
      setup_needs: body.setup_needs ? String(body.setup_needs) : "",
      special_requirements: body.special_requirements
        ? String(body.special_requirements)
        : "",
      notes: body.notes ? String(body.notes) : "",
      adults: body.guest_count != null ? Number(body.guest_count) : null,
      kids: null,
      event_date,
      event_time: body.event_time ? String(body.event_time) : "",
      budget: "",
      package_tier: "",
      confirmed: false,
    },
  });

  if (!created) {
    return NextResponse.json({ error: "Could not create booking" }, { status: 400 });
  }

  if (body.admin_notes != null) {
    const updated = await updateCateringBooking(created.id, {
      admin_notes: String(body.admin_notes),
    });
    return NextResponse.json({ booking: updated || created });
  }

  return NextResponse.json({ booking: created });
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const existing = await getCateringBooking(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  const keys = [
    "event_date",
    "event_time",
    "status",
    "customer_name",
    "customer_email",
    "customer_phone",
    "occasion",
    "guest_count",
    "diet",
    "meal",
    "delivery_or_pickup",
    "city",
    "address",
    "setup_needs",
    "special_requirements",
    "notes",
    "items_summary",
    "food_subtotal",
    "admin_notes",
  ] as const;
  for (const k of keys) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (patch.guest_count != null) patch.guest_count = Number(patch.guest_count);
  if (patch.food_subtotal != null) {
    patch.food_subtotal = Number(patch.food_subtotal);
  }

  const booking = await updateCateringBooking(id, patch);
  return NextResponse.json({ booking });
}
