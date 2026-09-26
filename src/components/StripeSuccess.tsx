"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/lib/cart-store";

export function StripeSuccess({ sessionId }: { sessionId: string }) {
  const clear = useCartStore((s) => s.clear);
  const [order, setOrder] = useState<string>("");
  const [invoice, setInvoice] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error || "Could not confirm order");
        return;
      }
      setOrder(data.order_number);
      setInvoice(data.invoice_number || "");
      clear();
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, clear]);

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
        Confirmed
      </p>
      <h1
        className="mt-4 text-5xl tracking-tight"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Thank you
      </h1>
      {error ? (
        <p className="mt-4 text-red-700">{error}</p>
      ) : (
        <p className="mt-4 text-muted">
          {order
            ? `Order ${order} is paid. Invoice ${invoice} will be emailed when Resend is configured.`
            : "Confirming your payment…"}
        </p>
      )}
      <Link
        href="/"
        className="mt-10 inline-flex bg-accent-deep px-6 py-3 text-sm font-semibold text-white"
      >
        Back home
      </Link>
    </div>
  );
}
