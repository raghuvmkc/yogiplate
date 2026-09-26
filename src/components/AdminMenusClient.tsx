"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { DietTag, MenuCategory, MenuItem } from "@/lib/types";

const diets: DietTag[] = [
  "jain",
  "swaminarayan",
  "pushtimarg",
  "pure_vegetarian",
  "vegan",
  "italian",
];

export function AdminMenusClient({
  initialItems,
  categories,
}: {
  initialItems: MenuItem[];
  categories: MenuCategory[];
}) {
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    unit: "half tray",
    category_id: categories[0]?.id || "",
    diet_tags: [] as DietTag[],
  });

  async function refresh() {
    const res = await fetch("/api/menus");
    const data = await res.json();
    setItems(data.items);
  }

  async function save() {
    await fetch("/api/menus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: Number(form.price),
      }),
    });
    setForm({
      name: "",
      description: "",
      price: "",
      unit: "half tray",
      category_id: categories[0]?.id || "",
      diet_tags: [],
    });
    await refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/menus?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Menus
      </h1>

      <div className="mt-8 grid gap-3 border border-line p-4 sm:grid-cols-2">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          placeholder="Unit"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        />
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          className="border border-line px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border border-line px-3 py-2 text-sm sm:col-span-2"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {diets.map((d) => {
            const on = form.diet_tags.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    diet_tags: on
                      ? form.diet_tags.filter((x) => x !== d)
                      : [...form.diet_tags, d],
                  })
                }
                className={`border px-3 py-1 text-xs ${
                  on
                    ? "border-accent-deep bg-accent-deep text-white"
                    : "border-line"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={save}
          className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
        >
          Add menu item
        </button>
      </div>

      <ul className="mt-8 divide-y divide-line border-t border-line">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 py-4 text-sm sm:flex-row sm:justify-between"
          >
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-muted">{item.description}</p>
              <p className="mt-1 text-xs text-accent">
                {item.diet_tags.join(", ")}
              </p>
            </div>
            <div className="text-right">
              <p>
                {item.variants?.length
                  ? `from ${formatMoney(item.price)}`
                  : `${formatMoney(item.price)} / ${item.unit}`}
              </p>
                {item.variants?.length ? (
                <p className="mt-1 text-xs text-muted">
                  {item.variants
                    .map((v) =>
                      v.serves
                        ? `${v.label} ${formatMoney(v.price)} (Serves ${v.serves})`
                        : `${v.label} ${formatMoney(v.price)}`
                    )
                    .join(" · ")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="mt-1 text-xs text-red-700 underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
