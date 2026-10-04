import Link from "next/link";
import { AdminLogout } from "@/components/AdminLogout";
import { isAdminAuthenticated } from "@/lib/auth";

const nav = [
  { href: "/admin/desk", label: "Desk" },
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/menus", label: "Menus" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAdminAuthenticated();

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/admin"
            className="text-2xl tracking-tight"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Yogiplate Admin
          </Link>
          {authed ? (
            <nav className="flex flex-wrap items-center gap-3 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-muted hover:text-accent-deep"
                >
                  {n.label}
                </Link>
              ))}
              <AdminLogout />
            </nav>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
