"use client";

import { useState } from "react";

export function TestAlertButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function send() {
    setState("sending");
    const res = await fetch("/api/admin/health/test-alert", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setState(res.ok ? "sent" : "failed");
    setMessage(res.ok ? `Sent to ${data.to}. Check your inbox (and spam).` : data.error || "Could not send.");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className="border border-accent-deep px-4 py-2 text-sm font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send test alert email"}
      </button>
      {message ? (
        <span className={`text-sm ${state === "failed" ? "text-red-700" : "text-muted"}`}>{message}</span>
      ) : null}
    </div>
  );
}
