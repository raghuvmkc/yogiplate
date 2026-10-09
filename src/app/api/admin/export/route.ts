import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const header = [
    "order_number",
    "customer_name",
    "customer_email",
    "customer_phone",
    "diet_profile",
    "event_date",
    "guest_count",
    "city",
    "zip",
    "miles",
    "subtotal",
    "delivery_fee",
    "setup_fee",
    "discount",
    "tax",
    "total",
    "coupon",
    "status",
    "paid_at",
  ];
  const rows = db.orders.map((o) =>
    [
      o.order_number,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.diet_profile,
      o.event_date,
      o.guest_count,
      o.delivery_city,
      o.delivery_zip,
      o.delivery_miles,
      o.subtotal,
      o.delivery_fee,
      o.setup_fee ?? 0,
      o.discount,
      o.tax,
      o.total,
      o.coupon_code || "",
      o.status,
      o.paid_at || "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="yogiplate-orders.csv"',
    },
  });
}
