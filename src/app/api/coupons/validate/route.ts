import { NextResponse } from "next/server";
import { findCoupon } from "@/lib/orders";
import { applyCoupon } from "@/lib/pricing";

export async function POST(req: Request) {
  const body = await req.json();
  const code = String(body.code || "").trim();
  const subtotal = Number(body.subtotal) || 0;
  if (!code) {
    return NextResponse.json({ error: "Coupon code required." }, { status: 400 });
  }
  const coupon = await findCoupon(code);
  if (!coupon) {
    return NextResponse.json({ error: "Invalid or expired coupon." }, { status: 400 });
  }
  if (subtotal < coupon.min_order) {
    return NextResponse.json(
      { error: `Minimum order is $${coupon.min_order}.` },
      { status: 400 }
    );
  }
  const discount = applyCoupon(subtotal, coupon);
  return NextResponse.json({
    code: coupon.code,
    discount,
    type: coupon.type,
    value: coupon.value,
  });
}
