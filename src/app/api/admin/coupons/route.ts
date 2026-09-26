import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  deleteCoupon,
  listCoupons,
  newId,
  upsertCoupon,
} from "@/lib/repo";
import type { Coupon } from "@/lib/types";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ coupons: await listCoupons() });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const coupon: Coupon = {
    id: body.id || newId("coupon"),
    code: String(body.code || "").toUpperCase(),
    type: body.type === "fixed" ? "fixed" : "percent",
    value: Number(body.value),
    min_order: Number(body.min_order) || 0,
    max_uses: body.max_uses == null || body.max_uses === "" ? null : Number(body.max_uses),
    used_count: Number(body.used_count) || 0,
    expires_at: body.expires_at || null,
    is_active: body.is_active !== false,
  };
  await upsertCoupon(coupon);
  return NextResponse.json({ coupon });
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteCoupon(id);
  return NextResponse.json({ ok: true });
}
