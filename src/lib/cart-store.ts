"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartProposal } from "@/lib/chat/order-draft";
import type { CartLine, DietTag, MenuItem, MenuVariant } from "@/lib/types";

function lineIdFor(itemId: string, variantId?: string) {
  return variantId ? `${itemId}::${variantId}` : itemId;
}

function lineName(item: MenuItem, variant?: MenuVariant) {
  return variant ? `${item.name} (${variant.label})` : item.name;
}

const DIET_TAGS = new Set<DietTag>([
  "jain",
  "swaminarayan",
  "pushtimarg",
  "pure_vegetarian",
  "vegan",
  "italian",
]);

interface CartStore {
  diet: DietTag | null;
  guestCount: number;
  eventDate: string;
  notes: string;
  items: CartLine[];
  couponCode: string;
  setDiet: (diet: DietTag) => void;
  setGuestCount: (n: number) => void;
  setEventDate: (d: string) => void;
  setNotes: (n: string) => void;
  setCouponCode: (c: string) => void;
  addItem: (item: MenuItem, quantity?: number, variant?: MenuVariant) => void;
  updateQty: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  /** Apply AI Yogi cart proposal from chat (Phase 2). */
  applyProposal: (proposal: CartProposal) => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      diet: null,
      guestCount: 25,
      eventDate: "",
      notes: "",
      items: [],
      couponCode: "",
      setDiet: (diet) => set({ diet }),
      setGuestCount: (guestCount) => set({ guestCount }),
      setEventDate: (eventDate) => set({ eventDate }),
      setNotes: (notes) => set({ notes }),
      setCouponCode: (couponCode) => set({ couponCode }),
      addItem: (item, quantity = 1, variant) => {
        const selected =
          variant ||
          (item.variants?.length === 1 ? item.variants[0] : undefined);
        if (item.variants?.length && !selected) {
          return;
        }
        const qty = Math.max(quantity, item.min_quantity || 1);
        const line_id = lineIdFor(item.id, selected?.id);
        const existing = get().items.find((i) => i.line_id === line_id);
        const price = selected?.price ?? item.price;
        const unit = selected?.unit || item.unit;
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.line_id === line_id
                ? { ...i, quantity: i.quantity + qty }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...get().items,
              {
                menu_item_id: item.id,
                line_id,
                variant_id: selected?.id,
                name: lineName(item, selected),
                price,
                quantity: qty,
                unit,
              },
            ],
          });
        }
      },
      updateQty: (lineId, quantity) => {
        if (quantity <= 0) {
          set({
            items: get().items.filter((i) => i.line_id !== lineId),
          });
          return;
        }
        set({
          items: get().items.map((i) =>
            i.line_id === lineId ? { ...i, quantity } : i
          ),
        });
      },
      removeItem: (lineId) =>
        set({
          items: get().items.filter((i) => i.line_id !== lineId),
        }),
      clear: () =>
        set({
          items: [],
          couponCode: "",
          notes: "",
        }),
      applyProposal: (proposal) => {
        const lines: CartLine[] = (proposal.items || []).map((i) => ({
          menu_item_id: i.menu_item_id,
          line_id: lineIdFor(i.menu_item_id, i.variant_id),
          variant_id: i.variant_id,
          name: i.name,
          price: i.price,
          quantity: Math.max(1, i.quantity),
          unit: i.unit || "tray",
        }));
        if (!lines.length) return 0;

        const diet =
          proposal.diet && DIET_TAGS.has(proposal.diet as DietTag)
            ? (proposal.diet as DietTag)
            : get().diet;

        const next: Partial<CartStore> = {
          items: proposal.replace
            ? lines
            : (() => {
                const map = new Map(
                  get().items.map((i) => [i.line_id, { ...i }])
                );
                for (const line of lines) {
                  const existing = map.get(line.line_id);
                  if (existing) {
                    map.set(line.line_id, {
                      ...existing,
                      quantity: existing.quantity + line.quantity,
                    });
                  } else {
                    map.set(line.line_id, line);
                  }
                }
                return [...map.values()];
              })(),
        };
        if (diet) next.diet = diet;
        if (proposal.guest_count && proposal.guest_count > 0) {
          next.guestCount = proposal.guest_count;
        }
        if (proposal.event_date) next.eventDate = proposal.event_date;
        if (proposal.notes) {
          next.notes = get().notes
            ? `${get().notes}\n${proposal.notes}`
            : proposal.notes;
        }
        set(next);
        return lines.length;
      },
    }),
    {
      name: "yogiplate-cart",
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<CartStore> & { items?: CartLine[] };
        const items = (state.items || []).map((i) => ({
          ...i,
          line_id: i.line_id || i.menu_item_id,
        }));
        return { ...state, items } as CartStore;
      },
    }
  )
);
