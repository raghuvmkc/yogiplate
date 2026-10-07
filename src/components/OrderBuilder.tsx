"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { DIET_DETAILS, DIET_LABELS, PRIMARY_DIETS } from "@/lib/data/menu-seed";
import { EmailInvoiceOption } from "@/components/EmailInvoiceOption";
import { useCartStore } from "@/lib/cart-store";
import { notesForActiveDiet } from "@/lib/notes-for-diet";
import { cartSubtotal, formatMoney, lineTotal } from "@/lib/pricing";
import type { DietTag, MenuCategory, MenuItem, MenuVariant } from "@/lib/types";

const diets = PRIMARY_DIETS;

function MenuItemRow({
  item,
  activeDiet,
}: {
  item: MenuItem;
  activeDiet: DietTag | null;
}) {
  const { items, addItem, updateQty, removeItem } = useCartStore();
  const variants = item.variants || [];
  const [selectedVariantId, setSelectedVariantId] = useState(
    variants[0]?.id || ""
  );
  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) || variants[0];
  const lineId = selectedVariant
    ? `${item.id}::${selectedVariant.id}`
    : item.id;
  const inCart = items.find((i) => i.line_id === lineId);
  const displayPrice = selectedVariant?.price ?? item.price;
  const displayUnit = selectedVariant?.unit || item.unit;
  const notes = notesForActiveDiet(item, activeDiet);

  return (
    <li className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-4">
        {item.image ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden border border-line bg-warm sm:h-28 sm:w-28">
            <Image
              src={item.image}
              alt={item.name}
              fill
              className="object-cover"
              sizes="112px"
            />
          </div>
        ) : null}
        <div className="min-w-0 max-w-xl">
          <p className="text-lg font-semibold">{item.name}</p>
          <p className="mt-1.5 text-base font-medium text-muted">
            {item.description}
          </p>
          {notes ? (
            <p className="mt-1.5 text-sm font-medium text-accent">{notes}</p>
          ) : null}
          {variants.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {variants.map((v: MenuVariant) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.id)}
                  className={`border px-3 py-1.5 text-left transition ${
                    selectedVariantId === v.id
                      ? "border-accent-deep bg-accent-deep text-white"
                      : "border-line bg-white text-muted hover:border-accent"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {v.label} · {formatMoney(v.price)}
                  </span>
                  {v.serves ? (
                    <span
                      className={`mt-0.5 block text-[10px] font-normal leading-tight ${
                        selectedVariantId === v.id
                          ? "text-white/80"
                          : "text-muted"
                      }`}
                    >
                      Serves {v.serves}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-base font-semibold">
              {formatMoney(item.price)}{" "}
              <span className="font-medium text-muted">/ {item.unit}</span>
            </p>
          )}
          {variants.length > 0 ? (
            <p className="mt-2 text-sm font-medium text-muted">
              Selected: {formatMoney(displayPrice)} / {displayUnit}
              {selectedVariant?.serves
                ? ` · Serves ${selectedVariant.serves}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pt-1">
        {inCart ? (
          <>
            <button
              type="button"
              className="h-9 w-9 border border-line"
              onClick={() => updateQty(lineId, inCart.quantity - 1)}
            >
              −
            </button>
            <span className="cart-line-enter w-8 text-center text-sm font-semibold">
              {inCart.quantity}
            </span>
            <button
              type="button"
              className="h-9 w-9 border border-line"
              onClick={() => updateQty(lineId, inCart.quantity + 1)}
            >
              +
            </button>
            <button
              type="button"
              className="ml-2 text-xs text-muted underline"
              onClick={() => removeItem(lineId)}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => addItem(item, 1, selectedVariant)}
            className="border border-accent-deep px-4 py-2 text-sm font-semibold text-accent-deep transition hover:bg-accent-deep hover:text-white"
          >
            Add
          </button>
        )}
      </div>
    </li>
  );
}

export function OrderBuilder({ initialDiet }: { initialDiet?: DietTag }) {
  const {
    diet,
    setDiet,
    guestCount,
    setGuestCount,
    eventDate,
    setEventDate,
    eventTime,
    setEventTime,
    notes,
    setNotes,
    items,
    updateQty,
    removeItem,
  } = useCartStore();

  const [mounted, setMounted] = useState(false);
  const [invoiceNotice, setInvoiceNotice] = useState("");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (initialDiet && diets.includes(initialDiet)) {
      setDiet(initialDiet);
    }
  }, [initialDiet, setDiet]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/menus");
        const data = await res.json();
        setCategories(data.categories || []);
        setMenuItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeDiet = diet;
  const filtered = useMemo(() => {
    if (!activeDiet) return [];
    return menuItems.filter(
      (i) => i.is_available && i.diet_tags.includes(activeDiet)
    );
  }, [activeDiet, menuItems]);

  const dietCounts = useMemo(() => {
    const counts = {} as Record<DietTag, number>;
    for (const d of diets) {
      counts[d] = menuItems.filter(
        (i) =>
          i.is_available &&
          i.diet_tags.includes(d) &&
          i.category_id !== "cat-packages"
      ).length;
    }
    return counts;
  }, [menuItems]);

  const dietDetail = activeDiet ? DIET_DETAILS[activeDiet] : null;

  const orderedCategories = useMemo(() => {
    if (activeDiet !== "italian") return categories;
    const pizzas = categories.filter((c) => c.id === "cat-pizzas");
    const rest = categories.filter((c) => c.id !== "cat-pizzas");
    return [...pizzas, ...rest];
  }, [activeDiet, categories]);

  const subtotal = cartSubtotal(items);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-muted sm:px-6">
        Loading order builder…
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_340px] sm:px-6">
      <div>
        <p className="eyebrow">Catering menu</p>
        <h1 className="font-display mt-4 text-5xl text-foreground sm:text-6xl">
          Choose your tradition
        </h1>
        <p className="lede mt-5 max-w-2xl">
          Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, or Italian —
          each path opens only the dishes that belong. Pure Vegetarian includes
          the full kitchen. The same tray may appear in more than one menu when
          it truly qualifies.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {diets.map((d) => {
            const selected = activeDiet === d;
            const count = dietCounts[d] ?? 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDiet(d)}
                className={`group flex items-center justify-between gap-3 border px-5 py-4 text-left transition ${
                  selected
                    ? "border-accent-deep bg-accent-deep text-white shadow-sm"
                    : "border-line bg-white text-foreground hover:border-accent"
                }`}
              >
                <span>
                  <span className="block text-base font-semibold sm:text-lg">
                    {DIET_LABELS[d]}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] font-medium tracking-wide ${
                      selected ? "text-white/75" : "text-muted"
                    }`}
                  >
                    {selected ? "Selected menu" : "View dishes"}
                  </span>
                </span>
                <span
                  className={`flex h-11 min-w-11 flex-col items-center justify-center rounded-full px-2.5 ${
                    selected
                      ? "bg-white/20 text-white"
                      : "bg-warm text-accent-deep group-hover:bg-accent/10"
                  }`}
                  aria-label={`${count} menu items`}
                >
                  <span className="font-display text-lg font-semibold leading-none">
                    {loading ? "—" : count}
                  </span>
                  <span
                    className={`mt-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      selected ? "text-white/70" : "text-muted"
                    }`}
                  >
                    items
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {dietDetail && activeDiet ? (
          <motion.section
            key={activeDiet}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-10 border-2 border-line bg-warm px-6 py-8 sm:px-8"
          >
            <p className="eyebrow">{DIET_LABELS[activeDiet]} menu</p>
            <h2 className="font-display mt-3 text-3xl text-foreground sm:text-4xl">
              {dietDetail.headline}
            </h2>
            <div className="mt-5 space-y-4">
              {dietDetail.body.map((para) => (
                <p
                  key={para.slice(0, 48)}
                  className="text-base font-medium leading-relaxed text-muted sm:text-lg"
                >
                  {para}
                </p>
              ))}
            </div>
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {dietDetail.principles.map((p) => (
                <li
                  key={p}
                  className="flex gap-2 text-sm font-semibold text-foreground"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-medium text-muted">
              Scroll below to add trays, desserts, and pizzas that fit this
              path.
            </p>
          </motion.section>
        ) : (
          <p className="mt-8 text-base font-medium text-accent">
            Select a menu above to read its meaning and start adding dishes.
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Guest count</span>
            <input
              type="number"
              min={1}
              placeholder="e.g. 25"
              value={guestCount > 0 ? guestCount : ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setGuestCount(raw === "" ? 0 : Number(raw) || 0);
              }}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Event date</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Event time</span>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="mt-1.5 w-full border border-line bg-white px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-foreground">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Allergies, setup timing, temple seva notes…"
            className="mt-1.5 w-full border border-line bg-white px-3 py-2 outline-none focus:border-accent"
          />
        </label>

        {loading ? (
          <p className="mt-12 text-muted">Loading menu…</p>
        ) : !activeDiet ? null : (
          <div className="mt-12 space-y-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeDiet}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className="space-y-12"
              >
                {orderedCategories.map((cat) => {
                  const catItems = filtered.filter(
                    (i) => i.category_id === cat.id
                  );
                  if (!catItems.length) return null;
                  return (
                    <section key={cat.id} id={cat.id}>
                      <h2 className="font-display border-b-2 border-line pb-3 text-3xl sm:text-4xl">
                        {cat.name}
                      </h2>
                      <ul className="mt-4 divide-y divide-line">
                        {catItems.map((item) => (
                          <MenuItemRow
                            key={item.id}
                            item={item}
                            activeDiet={activeDiet}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      <aside className="h-fit border-2 border-line bg-warm p-6 lg:sticky lg:top-28">
        <h3 className="font-display text-3xl font-semibold">Your order</h3>
        {activeDiet ? (
          <p className="mt-1.5 text-base font-semibold text-accent">
            {DIET_LABELS[activeDiet]}
          </p>
        ) : null}
        <ul className="mt-5 max-h-72 space-y-3 overflow-y-auto">
          <AnimatePresence initial={false}>
            {items.length === 0 ? (
              <li className="text-base font-medium text-muted">No items yet.</li>
            ) : (
              items.map((i) => (
                <motion.li
                  key={i.line_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 leading-snug">{i.name}</span>
                    <span className="shrink-0 font-medium">
                      {formatMoney(lineTotal(i.price, i.quantity))}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${i.name}`}
                      className="h-7 w-7 border border-line bg-white text-sm"
                      onClick={() => updateQty(i.line_id, i.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">
                      {i.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${i.name}`}
                      className="h-7 w-7 border border-line bg-white text-sm"
                      onClick={() => updateQty(i.line_id, i.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-xs text-muted underline hover:text-accent"
                      onClick={() => removeItem(i.line_id)}
                    >
                      Remove
                    </button>
                  </div>
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </ul>
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-semibold">{formatMoney(subtotal)}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Delivery fee calculated at checkout by distance.
          </p>
          <Link
            href="/checkout"
            className={`mt-4 flex w-full items-center justify-center py-3 text-sm font-semibold text-white ${
              items.length && activeDiet && eventDate
                ? "bg-accent-deep hover:bg-accent"
                : "pointer-events-none bg-foreground/25"
            }`}
          >
            Continue to checkout
          </Link>
          <EmailInvoiceOption
            disabled={!(items.length && activeDiet && eventDate)}
            onSent={setInvoiceNotice}
          />
          {(!eventDate || !activeDiet) && items.length > 0 ? (
            <p className="mt-2 text-xs text-accent">
              Select diet and event date to continue.
            </p>
          ) : null}
          {invoiceNotice ? (
            <p className="mt-3 border border-accent/30 bg-accent-soft p-3 text-sm font-medium text-accent-deep">
              {invoiceNotice}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
