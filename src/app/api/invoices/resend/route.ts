import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { sendInvoiceEmail } from "@/lib/invoice";
import { getDb, updateDb } from "@/lib/store/local-db";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { order_id } = await req.json();
  const db = await getDb();
  const order = db.orders.find((o) => o.id === order_id);
  const invoice = db.invoices.find((i) => i.order_id === order_id);
  if (!order || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const result = await sendInvoiceEmail({
    to: order.customer_email,
    subject: `Yogiplate Invoice ${invoice.invoice_number} — Order ${order.order_number}`,
    html: invoice.html,
  });
  if (result.sent) {
    await updateDb((d) => {
      const inv = d.invoices.find((i) => i.id === invoice.id);
      if (inv) inv.email_sent_at = new Date().toISOString();
    });
  }
  return NextResponse.json(result);
}
