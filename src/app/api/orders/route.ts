import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  return NextResponse.json({
    orders: db.orders,
    order_items: db.order_items,
    customers: db.customers,
    invoices: db.invoices,
  });
}
