"use client";

import { useState } from "react";
import type { OrderStatus } from "@/lib/types";

const statuses: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "delivered",
  "cancelled",
];

export function OrderStatusSelect({
  orderId,
  initial,
}: {
  orderId: string;
  initial: OrderStatus;
}) {
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function onChange(next: OrderStatus) {
    setStatus(next);
    setSaving(true);
    await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status: next }),
    });
    setSaving(false);
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
      className="border border-line bg-white px-2 py-1 text-xs"
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
