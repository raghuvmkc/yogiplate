"use client";

import { useState } from "react";
import type { Coupon } from "@/lib/types";

export function AdminCouponsClient({ initial }: { initial: Coupon[] }) {
  const [coupons, setCoupons] = useState(initial);
  const [form, setForm] = useState({
    code: "",
    type: "percent",
    value: "",
    min_order: "0",
    max_uses: "",
  });

  async function refresh() {
    const res = await fetch("/api/admin/coupons");
    const data = await res.json();
    setCoupons(data.coupons);
  }

  async function save() {
    await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        min_order: Number(form.min_order),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      }),
    });
    setForm({
      code: "",
      type: "percent",
      value: "",
      min_order: "0",
      max_uses: "",
    });
    await refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/coupons?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Coupons
      </h1>
      <div className="mt-8 grid gap-3 border border-line p-4 sm:grid-cols-5">
        <input
          placeholder="CODE"
          value={form.code}
          onChange={(e) =>
            setForm({ ...form, code: e.target.value.toUpperCase() })
          }
          className="border border-line px-3 py-2 text-sm"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="percent">Percent</option>
          <option value="fixed">Fixed $</option>
        </select>
        <input
          placeholder="Value"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          placeholder="Min order"
          value={form.min_order}
          onChange={(e) => setForm({ ...form, min_order: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={save}
          className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white"
        >
          Add coupon
        </button>
      </div>
      <ul className="mt-8 divide-y divide-line border-t border-line">
        {coupons.map((c) => (
          <li key={c.id} className="flex justify-between py-4 text-sm">
            <div>
              <p className="font-medium">{c.code}</p>
              <p className="text-muted">
                {c.type === "percent" ? `${c.value}%` : `$${c.value}`} off · min $
                {c.min_order} · used {c.used_count}
                {c.max_uses != null ? `/${c.max_uses}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(c.id)}
              className="text-xs text-red-700 underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
