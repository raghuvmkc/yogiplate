import { promises as fs } from "fs";
import path from "path";
import {
  MENU_SEED_VERSION,
  categories,
  defaultCoupons,
  defaultSettings,
  menuItems,
} from "@/lib/data/menu-seed";
import type {
  Coupon,
  Customer,
  Invoice,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  SiteSettings,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export interface LocalDatabase {
  seed_version?: string;
  categories: MenuCategory[];
  menu_items: MenuItem[];
  customers: Customer[];
  coupons: Coupon[];
  orders: Order[];
  order_items: OrderItem[];
  invoices: Invoice[];
  settings: SiteSettings;
  admin: { email: string; password_hash: string };
}

async function ensureDb(): Promise<LocalDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const db = JSON.parse(raw) as LocalDatabase;
    if (db.seed_version !== MENU_SEED_VERSION) {
      db.seed_version = MENU_SEED_VERSION;
      db.categories = categories;
      db.menu_items = menuItems;
      await saveDb(db);
    }
    return db;
  } catch {
    const bcrypt = await import("bcryptjs");
    const password_hash = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || "yogiplate-admin",
      10
    );
    const db: LocalDatabase = {
      seed_version: MENU_SEED_VERSION,
      categories,
      menu_items: menuItems,
      customers: [],
      coupons: defaultCoupons,
      orders: [],
      order_items: [],
      invoices: [],
      settings: defaultSettings,
      admin: {
        email: process.env.ADMIN_EMAIL || "admin@yogiplate.com",
        password_hash,
      },
    };
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
}

async function saveDb(db: LocalDatabase) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

export async function getDb() {
  return ensureDb();
}

export async function updateDb(
  mutator: (db: LocalDatabase) => void | Promise<void>
) {
  const db = await ensureDb();
  await mutator(db);
  await saveDb(db);
  return db;
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function orderNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `YP-${stamp}-${suffix}`;
}

export function invoiceNumber() {
  return orderNumber().replace("YP-", "INV-");
}
