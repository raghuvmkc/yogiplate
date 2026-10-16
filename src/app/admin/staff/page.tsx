import { redirect } from "next/navigation";
import { AdminStaffClient } from "@/components/AdminStaffClient";
import { isAdminAuthenticated } from "@/lib/auth";
import { staffSnapshot } from "@/lib/staff";

export default async function AdminStaffPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const initial = await staffSnapshot();
  return <AdminStaffClient initial={initial} />;
}
