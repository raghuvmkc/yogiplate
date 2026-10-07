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
import { serverEnv } from "@/lib/server-env";
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
import type { PendingCheckout } from "@/lib/store/pending";

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
  pending_checkouts?: Record<string, PendingCheckout>;
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
    const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = JSON.stringify(db, null, 2);
    await fs.writeFile(temp, body);
    try {
      await fs.rename(temp, filePath);
    } catch {
      // Windows and OneDrive can lock the target while it is being read.
      await fs.writeFile(filePath, body);
      await fs.unlink(temp).catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}

async function createSeedDb(): Promise<LocalDatabase> {
  const bcrypt = await import("bcryptjs");
  const password = serverEnv("ADMIN_PASSWORD");
  const email = serverEnv("ADMIN_EMAIL");
  if (!password || !email) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }
  const password_hash = await bcrypt.hash(password, 10);
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
      email,
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

type BlobStore = Awaited<ReturnType<typeof import("@netlify/blobs")["getStore"]>>;

const BLOB_KEY = "db";
const MAX_WRITE_ATTEMPTS = 6;

/**
 * On Netlify every request can land on a different server, and the disk is not
 * shared, so the database lives in Netlify Blobs. Locally it is `.data/db.json`.
 */
async function blobsStore(): Promise<BlobStore | null> {
  const onNetlify =
    process.env.NETLIFY === "true" ||
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) ||
    Boolean((globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext);
  if (!onNetlify) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "yogiplate", consistency: "strong" });
  } catch {
    return null;
  }
}

async function readBlob(
  store: BlobStore
): Promise<{ db: LocalDatabase | null; etag: string | null }> {
  const hit = await store.getWithMetadata(BLOB_KEY, { type: "text" });
  if (!hit?.data) return { db: null, etag: null };
  return { db: JSON.parse(hit.data) as LocalDatabase, etag: hit.etag || null };
}

/** Write only if nobody saved in between, so one save cannot erase another. */
async function writeBlob(
  store: BlobStore,
  db: LocalDatabase,
  etag: string | null
): Promise<boolean> {
  const body = JSON.stringify(db);
  const result = etag
    ? await store.set(BLOB_KEY, body, { onlyIfMatch: etag })
    : await store.set(BLOB_KEY, body, { onlyIfNew: true });
  return result.modified;
}

async function readDiskDb(): Promise<LocalDatabase | null> {
  for (const filePath of candidateDbPaths()) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const db = JSON.parse(raw) as LocalDatabase;
      resolvedDbFile = filePath;
      persistEnabled = true;
      return db;
    } catch {
      // try the next path
    }
  }
  return null;
}

async function writeDiskDb(db: LocalDatabase) {
  memoryDb = db;
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

/** One writer at a time inside this server, shared across route bundles. */
function withLocalLock<T>(task: () => Promise<T>): Promise<T> {
  const holder = globalThis as { __yogiplateDbLock?: Promise<unknown> };
  const prev = holder.__yogiplateDbLock || Promise.resolve();
  const run = prev.then(task, task);
  holder.__yogiplateDbLock = run.catch(() => undefined);
  return run;
}

async function loadDisk(): Promise<LocalDatabase> {
  const stored = await readDiskDb();
  if (stored) {
    if (applySeedIfNeeded(stored)) await writeDiskDb(stored);
    memoryDb = stored;
    return stored;
  }
  if (memoryDb) {
    applySeedIfNeeded(memoryDb);
    return memoryDb;
  }
  const db = await createSeedDb();
  await writeDiskDb(db);
  return db;
}

async function loadBlob(store: BlobStore): Promise<LocalDatabase> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const { db, etag } = await readBlob(store);
    if (db) {
      if (applySeedIfNeeded(db)) await writeBlob(store, db, etag);
      return db;
    }
    const seed = await createSeedDb();
    if (await writeBlob(store, seed, null)) return seed;
  }
  throw new Error("Could not load the shared database.");
}

export async function getDb() {
  const store = await blobsStore();
  if (store) return loadBlob(store);
  return loadDisk();
}

export async function updateDb(
  mutator: (db: LocalDatabase) => void | Promise<void>
) {
  const store = await blobsStore();
  if (!store) {
    return withLocalLock(async () => {
      const db = await loadDisk();
      await mutator(db);
      await writeDiskDb(db);
      return db;
    });
  }

  return withLocalLock(async () => {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const { db: stored, etag } = await readBlob(store);
      const db = stored || (await createSeedDb());
      applySeedIfNeeded(db);
      await mutator(db);
      if (await writeBlob(store, db, stored ? etag : null)) return db;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
    throw new Error("Another save was in progress. Please try again.");
  });
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
