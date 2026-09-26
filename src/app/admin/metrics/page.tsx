import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { computeAgentMetrics } from "@/lib/chat/metrics";
import { formatMoney } from "@/lib/pricing";

export default async function AdminMetricsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const m = await computeAgentMetrics();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Agent metrics
      </h1>
      <p className="mt-2 text-sm text-muted">
        Conversation outcomes, conversion, AOV, and tool usage (Phase 3).
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Chat sessions" value={String(m.sessions)} />
        <Stat label="Turns" value={String(m.turns)} />
        <Stat
          label="Conversion"
          value={`${Math.round(m.conversion_rate * 100)}%`}
        />
        <Stat
          label="Escalation rate"
          value={`${Math.round(m.escalation_rate * 100)}%`}
        />
        <Stat label="Cart proposals" value={String(m.cart_proposals)} />
        <Stat label="Quotes sent" value={`${m.quotes_sent} / ${m.quotes_total}`} />
        <Stat label="Deposits paid" value={String(m.deposits_paid)} />
        <Stat label="AOV (paid)" value={formatMoney(m.aov)} />
        <Stat label="Paid revenue" value={formatMoney(m.revenue)} />
        <Stat label="Reminders pending" value={String(m.reminders_pending)} />
        <Stat label="Reminders sent" value={String(m.reminders_sent)} />
        <Stat label="WhatsApp offers" value={String(m.escalations)} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Tool usage</h2>
      <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
        {Object.entries(m.tool_counts)
          .sort((a, b) => b[1] - a[1])
          .map(([tool, count]) => (
            <li key={tool} className="flex justify-between py-2">
              <span>{tool}</span>
              <span className="text-muted">{count}</span>
            </li>
          ))}
        {!Object.keys(m.tool_counts).length ? (
          <li className="py-4 text-muted">No tool calls logged yet.</li>
        ) : null}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Recent sessions</h2>
      <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
        {m.recent_sessions.map((s) => (
          <li key={s.id} className="py-3">
            <p className="font-medium">
              {s.lead_name || "Guest"} · {s.channel} · {s.outcome || "browsing"}
            </p>
            <p className="text-muted">
              {s.lead_email} · {s.turn_count} turns · tools:{" "}
              {s.tools_used.join(", ") || "—"}
            </p>
          </li>
        ))}
        {!m.recent_sessions.length ? (
          <li className="py-4 text-muted">No sessions yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className="mt-1 text-2xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}
