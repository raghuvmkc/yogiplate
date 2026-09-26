import { redirect } from "next/navigation";
import { AdminMenusClient } from "@/components/AdminMenusClient";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export default async function AdminMenusPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();
  return (
    <AdminMenusClient
      initialItems={db.menu_items}
      categories={db.categories}
    />
  );
}
