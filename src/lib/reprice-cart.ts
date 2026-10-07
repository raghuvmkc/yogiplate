import type { LocalDatabase } from "@/lib/store/local-db";
import type { CartLine } from "@/lib/types";

/**
 * Rebuild cart lines from the menu so a guest cannot change prices in the browser.
 * Throws if a dish or tray size is no longer offered.
 */
export function repriceCart(db: LocalDatabase, lines: CartLine[]): CartLine[] {
  const menu = new Map(db.menu_items.map((item) => [item.id, item]));
  return lines.map((line) => {
    const item = menu.get(line.menu_item_id);
    if (!item || !item.is_available) {
      throw new Error(`${line.name || "A dish"} is no longer on the menu. Please remove it.`);
    }
    const variant = item.variants?.length
      ? item.variants.find((v) => v.id === line.variant_id)
      : undefined;
    if (item.variants?.length && !variant) {
      throw new Error(`Please choose a tray size for ${item.name}.`);
    }
    const quantity = Math.max(item.min_quantity || 1, Math.floor(Number(line.quantity) || 0));
    return {
      ...line,
      name: variant ? `${item.name} (${variant.label})` : item.name,
      price: variant?.price ?? item.price,
      unit: variant?.unit || item.unit,
      quantity,
    };
  });
}
