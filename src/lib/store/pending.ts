import { promises as fs } from "fs";
import path from "path";
import type { CartLine, DietTag } from "@/lib/types";

const FILE = path.join(process.cwd(), ".data", "pending.json");

export interface PendingCheckout {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  diet_profile: DietTag;
  event_date: string;
  guest_count: number;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_miles: number;
  items: CartLine[];
  coupon_code: string | null;
  notes: string | null;
  created_at: string;
  order_id?: string;
  order_number?: string;
  invoice_number?: string;
}

async function readAll(): Promise<Record<string, PendingCheckout>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, PendingCheckout>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function savePending(pending: PendingCheckout) {
  const all = await readAll();
  all[pending.id] = pending;
  await writeAll(all);
}

export async function takePending(id: string) {
  const all = await readAll();
  const item = all[id];
  if (item) {
    delete all[id];
    await writeAll(all);
  }
  return item || null;
}

export async function getPending(id: string) {
  const all = await readAll();
  return all[id] || null;
}
