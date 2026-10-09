import { redirect } from "next/navigation";
import { TestAlertButton } from "@/components/TestAlertButton";
import { isAdminAuthenticated } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health";
import { recentEvents } from "@/lib/monitor";
import { alertNotifyEmails } from "@/lib/smtp";

function pacific(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminHealthPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const [report, events] = await Promise.all([runHealthChecks(), recentEvents(50)]);
  const banner =
    report.status === "ok"
      ? { text: "Everything customers use is working.", cls: "border-green-700/30 bg-green-50 text-green-900" }
      : report.status === "degraded"
        ? { text: "Customers can order, but something needs attention.", cls: "border-amber-600/40 bg-amber-50 text-amber-900" }
        : { text: "Customers are affected right now. Fix the red items first.", cls: "border-red-700/40 bg-red-50 text-red-900" };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-foreground">Site health</h1>
        <p className="mt-2 text-sm text-muted">Checked {pacific(report.checked_at)} (Pacific). Reload the page to check again.</p>
      </div>

      <p className={`border px-4 py-3 text-base font-semibold ${banner.cls}`}>{banner.text}</p>

      <ul className="divide-y divide-line border border-line">
        {report.checks.map((check) => (
          <li key={check.name} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                check.ok ? "bg-green-600" : check.critical ? "bg-red-600" : "bg-amber-500"
              }`}
            />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{check.name}</p>
              <p className="text-sm text-muted break-words">{check.note}</p>
            </div>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="text-xl font-semibold text-foreground">Alert emails</h2>
        <p className="mt-1 text-sm text-muted">
          When a customer hits an error, an email goes to {alertNotifyEmails().join(", ")} (at most
          one per problem area every 30 minutes). Change the list with the ALERT_NOTIFY_EMAILS
          setting on Netlify.
        </p>
        <div className="mt-3">
          <TestAlertButton />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground">Recent customer errors</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No errors recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line text-sm">
            {events.map((event) => (
              <li key={event.id} className="px-4 py-3">
                <p className="font-semibold text-foreground">
                  {pacific(event.at)} · {event.area}
                  {event.path ? ` · ${event.path}` : ""}
                </p>
                <p className="mt-0.5 break-words text-foreground">{event.message}</p>
                {event.detail ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">{event.detail}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
