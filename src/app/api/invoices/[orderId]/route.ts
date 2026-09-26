import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const db = await getDb();
  const invoice = db.invoices.find((i) => i.order_id === orderId);
  const order = db.orders.find((o) => o.id === orderId);

  if (!invoice || !order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Customers can view by knowing order id; admin always can.
  // For public success links we expose HTML; tighten later with token if needed.
  const authed = await isAdminAuthenticated();
  if (!authed && order.status !== "paid") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return new NextResponse(invoice.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.html"`,
    },
  });
}
