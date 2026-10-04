import { redirect } from "next/navigation";
import { ManagerDesk } from "@/components/ManagerDesk";
import { isAdminAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/store/local-db";

export default async function AdminDeskPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const db = await getDb();
  const items = db.menu_items
    .filter((item) => item.is_available)
    .map((item) => ({
      id: item.id,
      category_id: item.category_id,
      name: item.name,
      price: item.price,
      unit: item.unit,
      variants: item.variants?.map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: variant.price,
        unit: variant.unit,
      })),
    }));
  return <ManagerDesk items={items} categories={db.categories} />;
}
