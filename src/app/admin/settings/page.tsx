import { redirect } from "next/navigation";
import { AdminSettingsClient } from "@/components/AdminSettingsClient";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export default async function AdminSettingsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();
  return <AdminSettingsClient initial={db.settings} />;
}
