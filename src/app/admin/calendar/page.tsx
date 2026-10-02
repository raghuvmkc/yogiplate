import { redirect } from "next/navigation";
import { AdminCalendarPageClient } from "@/components/AdminCalendarPageClient";
import { isAdminAuthenticated } from "@/lib/auth";

export default async function AdminCalendarPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <AdminCalendarPageClient />;
}
