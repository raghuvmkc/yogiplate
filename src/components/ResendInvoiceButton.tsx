"use client";

import { useState } from "react";

export function ResendInvoiceButton({ orderId }: { orderId: string }) {
  const [msg, setMsg] = useState("");
  return (
    <div>
      <button
        type="button"
        className="text-xs text-accent-deep underline"
        onClick={async () => {
          const res = await fetch("/api/invoices/resend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId }),
          });
          const data = await res.json();
          setMsg(data.sent ? "Sent" : data.reason || "Queued/logged");
        }}
      >
        Resend
      </button>
      {msg ? <p className="text-[10px] text-muted">{msg}</p> : null}
    </div>
  );
}
