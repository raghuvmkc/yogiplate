import { redirect } from "next/navigation";
import { AdminQuotesClient } from "@/components/AdminQuotesClient";
import { isAdminAuthenticated } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes";
import { listReminders } from "@/lib/reminders";

export default async function AdminQuotesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [quotes, reminders] = await Promise.all([listQuotes(), listReminders()]);
  return (
    <AdminQuotesClient initialQuotes={quotes} initialReminders={reminders} />
  );
}
