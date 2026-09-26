import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { getDb } from "@/lib/store/local-db";

export default async function AdminDashboard() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();
  const revenue = db.orders
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + o.total, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Dashboard
      </h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <Stat label="Orders" value={String(db.orders.length)} />
        <Stat label="Customers" value={String(db.customers.length)} />
        <Stat label="Revenue" value={formatMoney(revenue)} />
      </div>
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent orders</h2>
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {db.orders.slice(0, 8).map((o) => (
            <li key={o.id} className="flex justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{o.order_number}</p>
                <p className="text-muted">
                  {o.customer_name} · {o.diet_profile}
                </p>
              </div>
              <div className="text-right">
                <p>{formatMoney(o.total)}</p>
                <p className="text-muted">{o.status}</p>
              </div>
            </li>
          ))}
          {!db.orders.length ? (
            <li className="py-6 text-sm text-muted">No orders yet.</li>
          ) : null}
        </ul>
        <Link href="/admin/orders" className="mt-4 inline-block text-sm text-accent-deep underline">
          View all orders
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className="mt-2 text-3xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}
