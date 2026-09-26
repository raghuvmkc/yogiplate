import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { ResendInvoiceButton } from "@/components/ResendInvoiceButton";
import { isAdminAuthenticated } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { getDb } from "@/lib/store/local-db";

export default async function AdminOrdersPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className="text-4xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Orders
        </h1>
        <a
          href="/api/admin/export"
          className="border border-accent-deep px-4 py-2 text-sm font-semibold text-accent-deep"
        >
          Export CSV
        </a>
      </div>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="py-3 font-medium">Order</th>
              <th className="py-3 font-medium">Customer</th>
              <th className="py-3 font-medium">Event</th>
              <th className="py-3 font-medium">Total</th>
              <th className="py-3 font-medium">Status</th>
              <th className="py-3 font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {db.orders.map((o) => {
              const inv = db.invoices.find((i) => i.order_id === o.id);
              return (
                <tr key={o.id}>
                  <td className="py-3">
                    <p className="font-medium">{o.order_number}</p>
                    <p className="text-xs text-muted">{o.diet_profile}</p>
                  </td>
                  <td className="py-3">
                    <p>{o.customer_name}</p>
                    <p className="text-xs text-muted">{o.customer_email}</p>
                  </td>
                  <td className="py-3">
                    {o.event_date}
                    <br />
                    <span className="text-xs text-muted">
                      {o.guest_count} guests · {o.delivery_miles} mi
                    </span>
                  </td>
                  <td className="py-3">{formatMoney(o.total)}</td>
                  <td className="py-3">
                    <OrderStatusSelect orderId={o.id} initial={o.status} />
                  </td>
                  <td className="py-3">
                    <p className="text-xs">{inv?.invoice_number}</p>
                    <div className="mt-1 flex flex-col gap-1">
                      <Link
                        href={`/api/invoices/${o.id}`}
                        className="text-xs text-accent-deep underline"
                        target="_blank"
                      >
                        View / print
                      </Link>
                      <ResendInvoiceButton orderId={o.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!db.orders.length ? (
          <p className="py-8 text-sm text-muted">No orders yet.</p>
        ) : null}
      </div>
    </div>
  );
}
