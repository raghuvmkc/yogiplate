import {
  formatAdminCivilDate,
  formatAdminDateTime,
  formatAdminEventTime,
} from "@/lib/admin-time";
import { formatMoney, fromCents, toCents } from "@/lib/pricing";
import { prettyLabel } from "@/lib/quote-format";
import { getDb } from "@/lib/store/local-db";
import type {
  CalendarBlock,
  CateringBooking,
  CateringBookingStatus,
  Order,
  OrderItem,
  PaymentRecord,
  Quote,
} from "@/lib/types";

const STATUS_LABEL: Record<CateringBookingStatus, string> = {
  unconfirmed: "Unconfirmed",
  quote_sent: "Quote sent",
  order_placed: "Order placed",
  invoice_sent: "Invoice sent",
  partial: "Partial payment",
  paid: "Paid in full",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const RULE = "────────────────────────";

function line(label: string, value: string | number | null | undefined) {
  const text = value == null || value === "" ? "" : String(value).trim();
  if (!text) return null;
  return `${label}: ${text}`;
}

function paidOn(order: Order | null, booking: CateringBooking): number {
  if (order?.payments?.length) {
    return fromCents(order.payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  }
  if (order?.amount_paid) return order.amount_paid;
  if (order?.status === "paid") return order.total;
  return booking.amount_paid ?? 0;
}

function addressLine(booking: CateringBooking, order: Order | null, quote: Quote | null) {
  if (order) {
    const parts = [
      order.delivery_address,
      order.delivery_city,
      order.delivery_state,
      order.delivery_zip,
    ]
      .map((p) => String(p || "").trim())
      .filter(Boolean);
    return parts.join(", ");
  }
  const parts = [booking.address || quote?.address, booking.city || quote?.city]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function paymentLines(payments: PaymentRecord[] | undefined): string[] {
  if (!payments?.length) return [];
  return payments.map((p, i) => {
    const when = formatAdminDateTime(p.paid_at);
    const how = p.note || p.method || (p.stripe_session_id ? "card/Stripe" : "payment");
    return `  ${i + 1}. ${formatMoney(p.amount)} on ${when} · ${how}`;
  });
}

function dishLines(
  items: { name: string; quantity: number; unit_price: number; line_total?: number; unit?: string }[]
): string[] {
  if (!items.length) return ["  (no dishes listed yet)"];
  return items.map((item) => {
    const total =
      item.line_total != null
        ? item.line_total
        : fromCents(toCents(item.unit_price) * Math.max(0, item.quantity));
    const unit = item.unit ? ` / ${item.unit}` : "";
    return `  • ${item.quantity}× ${item.name} — ${formatMoney(item.unit_price)}${unit} = ${formatMoney(total)}`;
  });
}

function sortBookings(rows: CateringBooking[]) {
  return [...rows].sort((a, b) => {
    const ta = a.event_time || "99:99";
    const tb = b.event_time || "99:99";
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.customer_name || "").localeCompare(b.customer_name || "");
  });
}

function formatOneBooking(input: {
  index: number;
  booking: CateringBooking;
  order: Order | null;
  items: OrderItem[];
  quote: Quote | null;
  invoiceNumber: string | null;
}): string {
  const { booking, order, items, quote, invoiceNumber } = input;
  const status = STATUS_LABEL[booking.status] || booking.status;
  const time =
    formatAdminEventTime(booking.event_time || order?.event_time || quote?.event_time) ||
    "Time TBD";
  const title =
    booking.occasion ||
    booking.customer_name ||
    order?.customer_name ||
    quote?.customer_name ||
    "Guest";

  const out: string[] = [];
  out.push(`*${input.index}) ${time} · ${title}*`);
  out.push(`Status: ${status.toUpperCase()}`);

  const refs = [
    booking.order_number || order?.order_number
      ? `Order ${booking.order_number || order?.order_number}`
      : null,
    booking.quote_number || quote?.quote_number
      ? `Quote ${booking.quote_number || quote?.quote_number}`
      : null,
    invoiceNumber || booking.invoice_number
      ? `Invoice ${invoiceNumber || booking.invoice_number}`
      : null,
  ].filter(Boolean);
  if (refs.length) out.push(refs.join(" · "));

  const name = booking.customer_name || order?.customer_name || quote?.customer_name || "Guest";
  const phone = booking.customer_phone || order?.customer_phone || quote?.customer_phone || "";
  const email = booking.customer_email || order?.customer_email || quote?.customer_email || "";
  out.push(`Contact: ${name}`);
  if (phone) out.push(`Phone: ${phone}`);
  if (email) out.push(`Email: ${email}`);

  const guests = booking.guest_count ?? order?.guest_count ?? quote?.guest_count ?? null;
  const diet = prettyLabel(booking.diet || order?.diet_profile || quote?.diet_profile);
  const meal = prettyLabel(booking.meal || quote?.meal);
  const service = prettyLabel(
    booking.delivery_or_pickup || quote?.delivery_or_pickup || (order ? (order.delivery_address === "Pickup" ? "pickup" : "delivery") : "")
  );
  const meta = [
    guests != null && guests > 0 ? `${guests} guests` : null,
    diet ? `Diet: ${diet}` : null,
    meal ? `Meal: ${meal}` : null,
    service || null,
  ].filter(Boolean);
  if (meta.length) out.push(meta.join(" · "));

  const addr = addressLine(booking, order, quote);
  if (addr) out.push(`Address: ${addr}`);
  if (order && order.delivery_miles > 0) {
    out.push(`Distance: ${order.delivery_miles} mi from kitchen`);
  }

  out.push("");
  out.push("*Dishes*");
  if (order && items.length) {
    out.push(...dishLines(items));
  } else if (quote?.items?.length) {
    out.push(
      ...dishLines(
        quote.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit: item.unit,
        }))
      )
    );
  } else if (booking.items_summary) {
    out.push(`  ${booking.items_summary}`);
  } else {
    out.push("  (no dishes listed yet)");
  }

  out.push("");
  out.push("*Money*");
  if (order) {
    out.push(`  Food subtotal: ${formatMoney(order.subtotal)}`);
    if (order.delivery_fee) out.push(`  Delivery: ${formatMoney(order.delivery_fee)}`);
    if (order.setup_fee) out.push(`  Setup: ${formatMoney(order.setup_fee)}`);
    if (order.discount) {
      const pct =
        order.discount_percent != null && order.discount_percent > 0
          ? ` (${order.discount_percent}%)`
          : "";
      const reason = order.discount_reason ? ` — ${order.discount_reason}` : "";
      out.push(`  Discount: −${formatMoney(order.discount)}${pct}${reason}`);
    }
    if (order.coupon_code) out.push(`  Coupon: ${order.coupon_code}`);
    out.push(`  Tax: ${formatMoney(order.tax)}`);
    out.push(`  *TOTAL DUE: ${formatMoney(order.total)}*`);
    const paid = paidOn(order, booking);
    const balance = fromCents(Math.max(0, toCents(order.total) - toCents(paid)));
    out.push(`  Paid: ${formatMoney(paid)} · Balance: ${formatMoney(balance)}`);
    out.push(`  Order status: ${order.status}`);
    const pays = paymentLines(order.payments?.length ? order.payments : booking.payments);
    if (pays.length) {
      out.push("  Payments:");
      out.push(...pays);
    }
  } else if (quote) {
    out.push(`  Food estimate: ${formatMoney(quote.food_subtotal)}`);
    out.push(`  Estimated total: ${formatMoney(quote.estimated_total)}`);
    out.push(
      `  Deposit: ${formatMoney(quote.deposit_amount)} (${quote.deposit_percent}%)${
        quote.deposit_paid_at ? ` · paid ${formatAdminDateTime(quote.deposit_paid_at)}` : " · unpaid"
      }`
    );
    out.push(`  Quote status: ${quote.status}`);
    if (quote.expires_at) out.push(`  Expires: ${formatAdminDateTime(quote.expires_at)}`);
  } else {
    if (booking.food_subtotal != null) {
      out.push(`  Food subtotal: ${formatMoney(booking.food_subtotal)}`);
    }
    if (booking.amount_due != null) {
      out.push(`  Amount due: ${formatMoney(booking.amount_due)}`);
    }
    if (booking.amount_paid) {
      out.push(`  Amount paid: ${formatMoney(booking.amount_paid)}`);
    }
    const pays = paymentLines(booking.payments);
    if (pays.length) {
      out.push("  Payments:");
      out.push(...pays);
    }
    if (
      booking.food_subtotal == null &&
      booking.amount_due == null &&
      !booking.amount_paid
    ) {
      out.push("  (no pricing yet)");
    }
  }

  const notes = [
    line("Special requirements", booking.special_requirements || quote?.special_requirements),
    line("Setup needs", booking.setup_needs || quote?.setup_needs),
    line("Guest notes", booking.notes || order?.notes || quote?.notes),
    line("Admin notes", booking.admin_notes),
  ].filter(Boolean) as string[];
  if (notes.length) {
    out.push("");
    out.push("*Notes*");
    for (const n of notes) out.push(`  ${n}`);
  }

  return out.join("\n");
}

function formatBlocks(blocks: CalendarBlock[]): string | null {
  if (!blocks.length) return null;
  const lines = ["*Kitchen holds / blackouts*", ""];
  for (const b of blocks) {
    const window =
      b.start_time || b.end_time
        ? `${formatAdminEventTime(b.start_time) || b.start_time || "?"} – ${formatAdminEventTime(b.end_time) || b.end_time || "?"}`
        : "All day";
    lines.push(`  • ${prettyLabel(b.kind) || b.kind} · ${window}`);
    if (b.guest_count) lines.push(`    Guests reserved: ${b.guest_count}`);
    if (b.notes) lines.push(`    ${b.notes}`);
    if (b.lead_phone || b.lead_email) {
      lines.push(`    Lead: ${[b.lead_phone, b.lead_email].filter(Boolean).join(" · ")}`);
    }
  }
  return lines.join("\n");
}

/** Full plain-text kitchen summary for one civil day — WhatsApp / email friendly. */
export async function buildDayOrderSummary(dateIso: string): Promise<{
  text: string;
  booking_count: number;
}> {
  const date = String(dateIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Valid date (YYYY-MM-DD) is required.");
  }

  const db = await getDb();
  const bookings = sortBookings(
    (db.catering_bookings || []).filter((row) => row.event_date === date)
  );
  const blocks = (db.calendar_blocks || []).filter(
    (row) => row.date === date && row.status === "active"
  );

  const headerDate = formatAdminCivilDate(date);
  const active = bookings.filter((b) => b.status !== "cancelled");
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  const head: string[] = [
    `*YOGIPLATE — Day summary*`,
    `${headerDate} (Pacific kitchen time)`,
    "",
  ];

  if (!bookings.length && !blocks.length) {
    head.push("No bookings, orders, or holds on this day.");
    head.push("");
    head.push(`Copied ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific`);
    return { text: head.join("\n"), booking_count: 0 };
  }

  head.push(
    `${bookings.length} booking${bookings.length === 1 ? "" : "s"}` +
      (active.length !== bookings.length ? ` (${cancelled.length} cancelled)` : "") +
      (blocks.length ? ` · ${blocks.length} hold/blackout` : "")
  );

  const totalDue = bookings.reduce((sum, b) => {
    const order =
      (b.order_id && db.orders.find((o) => o.id === b.order_id)) ||
      null;
    const quote =
      (b.quote_id && (db.quotes || []).find((q) => q.id === b.quote_id)) || null;
    const due = order?.total ?? quote?.estimated_total ?? b.amount_due ?? 0;
    if (b.status === "cancelled") return sum;
    return sum + toCents(due);
  }, 0);
  const totalPaid = bookings.reduce((sum, b) => {
    if (b.status === "cancelled") return sum;
    const order =
      (b.order_id && db.orders.find((o) => o.id === b.order_id)) || null;
    return sum + toCents(paidOn(order, b));
  }, 0);
  if (bookings.length) {
    head.push(
      `Day totals (excl. cancelled): due ${formatMoney(fromCents(totalDue))} · paid ${formatMoney(fromCents(totalPaid))} · balance ${formatMoney(fromCents(Math.max(0, totalDue - totalPaid)))}`
    );
  }
  head.push("");
  head.push(RULE);

  const sections: string[] = [head.join("\n")];

  const blockText = formatBlocks(blocks);
  if (blockText) {
    sections.push(blockText);
    sections.push(RULE);
  }

  let index = 1;
  for (const booking of bookings) {
    const quote =
      (booking.quote_id && (db.quotes || []).find((q) => q.id === booking.quote_id)) ||
      (booking.order_id && (db.quotes || []).find((q) => q.order_id === booking.order_id)) ||
      null;
    const orderId = booking.order_id || quote?.order_id || null;
    const order = orderId ? db.orders.find((o) => o.id === orderId) || null : null;
    const items = order
      ? db.order_items.filter((item) => item.order_id === order.id)
      : [];
    const invoice = order
      ? db.invoices.find((inv) => inv.order_id === order.id) || null
      : null;
    sections.push(
      formatOneBooking({
        index: index++,
        booking,
        order,
        items,
        quote,
        invoiceNumber: invoice?.invoice_number || booking.invoice_number || null,
      })
    );
    sections.push(RULE);
  }

  sections.push(
    `Copied ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific`
  );

  return { text: sections.join("\n\n"), booking_count: bookings.length };
}
