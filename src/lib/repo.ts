/**
 * Data access layer. Uses local JSON store (works offline).
 * When Supabase service role is configured, mirrors writes and prefers remote reads.
 */
import {
  MENU_SEED_VERSION,
  categories as seedCategories,
  defaultCoupons,
  defaultSettings,
  menuItems as seedMenuItems,
} from "@/lib/data/menu-seed";
import { getDb, updateDb, uid } from "@/lib/store/local-db";
import { createServiceSupabase } from "@/lib/supabase/server";
import type {
  Coupon,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  SiteSettings,
} from "@/lib/types";

export async function getCatalog(): Promise<{
  categories: MenuCategory[];
  items: MenuItem[];
}> {
  const supabase = createServiceSupabase();
  if (supabase) {
    const [{ data: cats }, { data: items }] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").eq("is_available", true),
    ]);
    if (cats?.length && items?.length) {
      return {
        categories: cats as MenuCategory[],
        items: items.map(mapMenuItem),
      };
    }
  }
  const db = await getDb();
  return { categories: db.categories, items: db.menu_items };
}

export async function getSettings(): Promise<SiteSettings> {
  const supabase = createServiceSupabase();
  if (supabase) {
    const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    if (data) return data as SiteSettings;
  }
  const db = await getDb();
  return db.settings;
}

export async function saveSettings(patch: Partial<SiteSettings>) {
  const db = await updateDb((d) => {
    d.settings = { ...d.settings, ...patch };
  });
  const supabase = createServiceSupabase();
  if (supabase) {
    await supabase.from("settings").upsert({ id: 1, ...db.settings });
  }
  return db.settings;
}

export async function listCoupons(): Promise<Coupon[]> {
  const supabase = createServiceSupabase();
  if (supabase) {
    const { data } = await supabase.from("coupons").select("*").order("code");
    if (data) return data as Coupon[];
  }
  const db = await getDb();
  return db.coupons;
}

export async function upsertCoupon(coupon: Coupon) {
  await updateDb((db) => {
    const idx = db.coupons.findIndex((c) => c.id === coupon.id);
    if (idx >= 0) db.coupons[idx] = coupon;
    else db.coupons.push(coupon);
  });
  const supabase = createServiceSupabase();
  if (supabase) {
    await supabase.from("coupons").upsert(coupon);
  }
  return coupon;
}

export async function deleteCoupon(id: string) {
  await updateDb((db) => {
    db.coupons = db.coupons.filter((c) => c.id !== id);
  });
  const supabase = createServiceSupabase();
  if (supabase) {
    await supabase.from("coupons").delete().eq("id", id);
  }
}

export async function upsertMenuItem(item: MenuItem) {
  await updateDb((db) => {
    const idx = db.menu_items.findIndex((m) => m.id === item.id);
    if (idx >= 0) db.menu_items[idx] = item;
    else db.menu_items.push(item);
  });
  const supabase = createServiceSupabase();
  if (supabase) {
    await supabase.from("menu_items").upsert({
      ...item,
      diet_tags: item.diet_tags,
    });
  }
  return item;
}

export async function deleteMenuItem(id: string) {
  await updateDb((db) => {
    db.menu_items = db.menu_items.filter((m) => m.id !== id);
  });
  const supabase = createServiceSupabase();
  if (supabase) {
    await supabase.from("menu_items").delete().eq("id", id);
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  let order: Order | undefined;
  await updateDb((db) => {
    const idx = db.orders.findIndex((o) => o.id === orderId);
    if (idx >= 0) {
      db.orders[idx].status = status;
      order = db.orders[idx];
    }
  });
  const supabase = createServiceSupabase();
  if (supabase && order) {
    await supabase.from("orders").update({ status }).eq("id", orderId);
  }
  return order;
}

export async function ensureSeededLocal() {
  await updateDb((db) => {
    if (db.seed_version !== MENU_SEED_VERSION || !db.categories.length) {
      db.seed_version = MENU_SEED_VERSION;
      db.categories = seedCategories;
      db.menu_items = seedMenuItems;
    }
    if (!db.coupons.length) db.coupons = defaultCoupons;
    if (!db.settings) db.settings = defaultSettings;
  });
}

export function newId(prefix: string) {
  return uid(prefix);
}

function mapMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    id: String(row.id),
    category_id: String(row.category_id || ""),
    name: String(row.name),
    description: String(row.description || ""),
    price: Number(row.price),
    unit: String(row.unit || "each"),
    diet_tags: (row.diet_tags as MenuItem["diet_tags"]) || [],
    is_available: row.is_available !== false,
    notes: row.notes ? String(row.notes) : undefined,
    min_quantity: row.min_quantity != null ? Number(row.min_quantity) : undefined,
    image: row.image ? String(row.image) : undefined,
    variants: Array.isArray(row.variants)
      ? (row.variants as MenuItem["variants"])
      : undefined,
  };
}
