import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  MENU_SEED_VERSION,
  categories,
  defaultCoupons,
  defaultSettings,
  menuItems,
} from "@/lib/data/menu-seed";
import type {
  CalendarBlock,
  CateringBooking,
  ChannelThread,
  ChatSessionLog,
  Coupon,
  Customer,
  Invoice,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  Quote,
  Reminder,
  SiteSettings,
} from "@/lib/types";
import type { GuestEventMemory } from "@/lib/planning/guest-memory";

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
  calendar_blocks?: CalendarBlock[];
  catering_bookings?: CateringBooking[];
  quotes?: Quote[];
  reminders?: Reminder[];
  chat_sessions?: ChatSessionLog[];
  channel_threads?: ChannelThread[];
  guest_events?: GuestEventMemory[];
  call_tickets?: CallTicket[];
  admin: { email: string; password_hash: string };
}

export type CallTicket = {
  id: string;
  to: string;
  expires_at: string;
  used_at: string | null;
};

/** In-memory fallback when the host FS is read-only (Netlify / serverless). */
let memoryDb: LocalDatabase | null = null;
let persistEnabled: boolean | null = null;
let resolvedDbFile: string | null = null;

function candidateDbPaths(): string[] {
  return [
    path.join(process.cwd(), ".data", "db.json"),
    path.join(os.tmpdir(), "yogiplate-data", "db.json"),
  ];
}

async function tryPersist(db: LocalDatabase, filePath: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(db, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function createSeedDb(): Promise<LocalDatabase> {
  const bcrypt = await import("bcryptjs");
  const password_hash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "yogiplate-admin",
    10
  );
  return {
    seed_version: MENU_SEED_VERSION,
    categories,
    menu_items: menuItems,
    customers: [],
    coupons: defaultCoupons,
    orders: [],
    order_items: [],
    invoices: [],
    settings: {
      ...defaultSettings,
      lead_time_hours: 48,
      max_guests_per_day: 200,
      hold_ttl_minutes: 120,
      deposit_percent: 30,
      quote_validity_days: 7,
    },
    calendar_blocks: [],
    catering_bookings: [],
    quotes: [],
    reminders: [],
    chat_sessions: [],
    channel_threads: [],
    guest_events: [],
    admin: {
      email: process.env.ADMIN_EMAIL || "admin@yogiplate.com",
      password_hash,
    },
  };
}

function applySeedIfNeeded(db: LocalDatabase): boolean {
  let changed = false;
  if (db.seed_version !== MENU_SEED_VERSION || !db.categories?.length) {
    db.seed_version = MENU_SEED_VERSION;
    db.categories = categories;
    db.menu_items = menuItems;
    changed = true;
  }
  if (!db.menu_items?.length) {
    db.menu_items = menuItems;
    changed = true;
  }
  if (!db.coupons?.length) {
    db.coupons = defaultCoupons;
    changed = true;
  }
  if (!db.settings) {
    db.settings = {
      ...defaultSettings,
      lead_time_hours: 48,
      max_guests_per_day: 200,
      hold_ttl_minutes: 120,
      deposit_percent: 30,
      quote_validity_days: 7,
    };
    changed = true;
  } else {
    if (db.settings.lead_time_hours == null) {
      db.settings.lead_time_hours = 48;
      changed = true;
    }
    if (db.settings.max_guests_per_day == null) {
      db.settings.max_guests_per_day = 200;
      changed = true;
    }
    if (db.settings.hold_ttl_minutes == null) {
      db.settings.hold_ttl_minutes = 120;
      changed = true;
    }
    if (db.settings.deposit_percent == null) {
      db.settings.deposit_percent = 30;
      changed = true;
    }
    if (db.settings.quote_validity_days == null) {
      db.settings.quote_validity_days = 7;
      changed = true;
    }
  }
  if (!db.calendar_blocks) {
    db.calendar_blocks = [];
    changed = true;
  }
  if (!db.catering_bookings) {
    db.catering_bookings = [];
    changed = true;
  }
  if (!db.quotes) {
    db.quotes = [];
    changed = true;
  }
  if (!db.reminders) {
    db.reminders = [];
    changed = true;
  }
  if (!db.chat_sessions) {
    db.chat_sessions = [];
    changed = true;
  }
  if (!db.channel_threads) {
    db.channel_threads = [];
    changed = true;
  }
  if (!db.guest_events) {
    db.guest_events = [];
    changed = true;
  }
  return changed;
}

async function ensureDb(): Promise<LocalDatabase> {
  if (memoryDb) {
    applySeedIfNeeded(memoryDb);
    return memoryDb;
  }

  // Prefer an existing on-disk DB when readable.
  for (const filePath of candidateDbPaths()) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const db = JSON.parse(raw) as LocalDatabase;
      const changed = applySeedIfNeeded(db);
      memoryDb = db;
      resolvedDbFile = filePath;
      if (changed) {
        persistEnabled = await tryPersist(db, filePath);
      } else {
        persistEnabled = true;
      }
      return db;
    } catch {
      // try next path / create fresh
    }
  }

  const db = await createSeedDb();
  memoryDb = db;

  for (const filePath of candidateDbPaths()) {
    if (await tryPersist(db, filePath)) {
      resolvedDbFile = filePath;
      persistEnabled = true;
      return db;
    }
  }

  // Serverless read-only FS — keep seeded catalog in memory for this instance.
  persistEnabled = false;
  resolvedDbFile = null;
  return db;
}

async function saveDb(db: LocalDatabase) {
  memoryDb = db;
  if (persistEnabled === false) return;

  const targets = resolvedDbFile
    ? [resolvedDbFile, ...candidateDbPaths()]
    : candidateDbPaths();

  for (const filePath of targets) {
    if (await tryPersist(db, filePath)) {
      resolvedDbFile = filePath;
      persistEnabled = true;
      return;
    }
  }
  persistEnabled = false;
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

export function quoteNumber() {
  return orderNumber().replace("YP-", "Q-");
}
