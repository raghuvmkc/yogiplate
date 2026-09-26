import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { listChannelThreads } from "@/lib/channels/inbound";

export default async function AdminInboxPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const threads = await listChannelThreads();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Omnichannel inbox
      </h1>
      <p className="mt-2 text-sm text-muted">
        WhatsApp / SMS / channel threads share the same AI Yogi tool layer (Phase 4).
      </p>

      <ul className="mt-8 divide-y divide-line border-t border-line">
        {threads.map((t) => (
          <li key={t.id} className="py-5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {t.channel} · {t.lead_name || t.external_id}
              </p>
              <p className="text-xs text-muted">
                {new Date(t.updated_at).toLocaleString()} · {t.status}
              </p>
            </div>
            <p className="text-muted">
              {t.lead_email || "—"} · {t.lead_phone || t.external_id}
            </p>
            <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
              {t.messages.slice(-6).map((m) => (
                <p key={m.id} className="text-xs leading-relaxed">
                  <span className="font-semibold uppercase text-muted">
                    {m.role}:
                  </span>{" "}
                  {m.content.slice(0, 280)}
                  {m.content.length > 280 ? "…" : ""}
                </p>
              ))}
            </div>
          </li>
        ))}
        {!threads.length ? (
          <li className="py-8 text-sm text-muted">
            No channel threads yet. Point WhatsApp/SMS webhooks at{" "}
            <code className="text-xs">/api/webhooks/whatsapp</code> or{" "}
            <code className="text-xs">/api/webhooks/sms</code>, or POST to{" "}
            <code className="text-xs">/api/channels/inbound</code>.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
