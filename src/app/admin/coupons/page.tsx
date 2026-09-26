import { redirect } from "next/navigation";
import { AdminCouponsClient } from "@/components/AdminCouponsClient";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export default async function AdminCouponsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();
  return <AdminCouponsClient initial={db.coupons} />;
}
