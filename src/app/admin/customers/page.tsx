import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export default async function AdminCustomersPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Customers
      </h1>
      <ul className="mt-8 divide-y divide-line border-t border-line">
        {db.customers.map((c) => {
          const orderCount = db.orders.filter((o) => o.customer_id === c.id).length;
          return (
            <li key={c.id} className="flex justify-between gap-4 py-4 text-sm">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted">
                  {c.email} · {c.phone}
                </p>
                <p className="text-xs text-muted">
                  {[c.address_line1, c.city, c.state, c.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="text-xs text-muted">
                  {[
                    c.source_channel && `source: ${c.source_channel}`,
                    c.last_channel && `last: ${c.last_channel}`,
                    c.last_contact_at &&
                      `contacted ${new Date(c.last_contact_at).toLocaleDateString()}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="text-muted">{orderCount} orders</p>
            </li>
          );
        })}
        {!db.customers.length ? (
          <li className="py-8 text-sm text-muted">No customers yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
