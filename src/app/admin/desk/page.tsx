import { redirect } from "next/navigation";
import { ManagerDesk } from "@/components/ManagerDesk";
import { isAdminAuthenticated } from "@/lib/auth";
import { DEFAULT_SETUP_FEE } from "@/lib/pricing";
import { getDb } from "@/lib/store/local-db";

export default async function AdminDeskPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login?next=/admin/desk");
  const db = await getDb();
  const items = db.menu_items
    .filter((item) => item.is_available)
    .map((item) => ({
      id: item.id,
      category_id: item.category_id,
      name: item.name,
      price: item.price,
      unit: item.unit,
      diet_tags: item.diet_tags,
      min_quantity: item.min_quantity,
      variants: item.variants?.map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: variant.price,
        unit: variant.unit,
        serves: variant.serves,
        serves_label: variant.serves_label,
      })),
    }));
  return (
    <ManagerDesk
      items={items}
      categories={db.categories}
      setupFee={db.settings.setup_fee ?? DEFAULT_SETUP_FEE}
    />
  );
}
