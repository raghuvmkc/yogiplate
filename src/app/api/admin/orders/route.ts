import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/repo";
import type { OrderStatus } from "@/lib/types";

const ALLOWED: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "delivered",
  "cancelled",
];

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const status = body.status as OrderStatus;
  if (!body.id || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const order = await updateOrderStatus(String(body.id), status);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
