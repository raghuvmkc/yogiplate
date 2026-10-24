import { getDb } from "@/lib/store/local-db";
import type {
  CalendarBlock,
  CateringBooking,
  Invoice,
  Order,
  OrderItem,
  Quote,
} from "@/lib/types";

export const CALENDAR_BACKUP_VERSION = 1;

export type CalendarBackupPayload = {
  version: typeof CALENDAR_BACKUP_VERSION;
  exported_at: string;
  bookings: CateringBooking[];
  calendar_blocks: CalendarBlock[];
  orders: Order[];
  order_items: OrderItem[];
  invoices: Invoice[];
  quotes: Quote[];
};

/** Full calendar snapshot: every booking field plus linked orders, lines, invoices, quotes, and kitchen blocks. */
export async function buildCalendarBackup(): Promise<CalendarBackupPayload> {
  const db = await getDb();
  const bookings = [...(db.catering_bookings || [])].sort((a, b) =>
    a.event_date === b.event_date
      ? (a.event_time || "").localeCompare(b.event_time || "") ||
        a.created_at.localeCompare(b.created_at)
      : a.event_date.localeCompare(b.event_date)
  );
  const calendar_blocks = [...(db.calendar_blocks || [])].sort((a, b) =>
    a.date === b.date
      ? a.created_at.localeCompare(b.created_at)
      : a.date.localeCompare(b.date)
  );

  const orderIds = new Set(
    bookings.map((b) => b.order_id).filter((id): id is string => Boolean(id))
  );
  const quoteIds = new Set(
    bookings.map((b) => b.quote_id).filter((id): id is string => Boolean(id))
  );
  const invoiceNumbers = new Set(
    bookings
      .map((b) => b.invoice_number)
      .filter((n): n is string => Boolean(n))
  );

  const orders = (db.orders || []).filter((o) => orderIds.has(o.id));
  const order_items = (db.order_items || []).filter((line) =>
    orderIds.has(line.order_id)
  );
  const invoices = (db.invoices || []).filter(
    (inv) => orderIds.has(inv.order_id) || invoiceNumbers.has(inv.invoice_number)
  );
  const quotes = (db.quotes || []).filter((q) => quoteIds.has(q.id));

  return {
    version: CALENDAR_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    bookings,
    calendar_blocks,
    orders,
    order_items,
    invoices,
    quotes,
  };
}

export function calendarBackupFilename(at = new Date()) {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `yogiplate-calendar-backup-${stamp}.json`;
}
