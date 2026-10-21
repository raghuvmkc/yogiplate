import { pacificCivilToUtcIso } from "@/lib/admin-time";
import { getBookingDetail } from "@/lib/booking-detail";
import { getDb, updateDb } from "@/lib/store/local-db";
import { sendSms, smsConfigured, toE164 } from "@/lib/sms";
import {
  buildUberWindow,
  cancelUberDelivery,
  createUberDelivery,
  createUberQuote,
  extractZip,
  formatDropoffSummary,
  formatUberAddress,
  getUberDelivery,
  mapUberDelivery,
  parseUsAddress,
  pickupAddressParts,
  pickupName,
  pickupPhone,
  trackingFromUber,
  uberConfigured,
  uberIsTerminal,
  type UberAddressParts,
  type UberDeliveryInfo,
} from "@/lib/uber-direct";
import type { CateringBooking, Order, Quote } from "@/lib/types";

export type UberScheduleInput = {
  /** Pacific civil date YYYY-MM-DD — defaults to event day when omitted. */
  pickup_date: string;
  /** Pacific HH:mm — required kitchen pickup ready time. */
  pickup_time: string;
  /**
   * Cancel the active Uber trip first, then create a new one for the current
   * event address (needed after the admin changes dropoff).
   */
  replace?: boolean;
};

type DropoffSources = {
  booking: CateringBooking;
  order: Order | null;
  quote: Quote | null;
};

/** Build dropoff from the linked order / booking / quote — admin does not re-enter anything. */
function dropoffFromEvent(sources: DropoffSources): UberAddressParts {
  const { booking, order, quote } = sources;

  const street = String(
    order?.delivery_address || booking.address || quote?.address || ""
  ).trim();
  const city = String(
    order?.delivery_city || booking.city || quote?.city || ""
  ).trim();
  const state = String(order?.delivery_state || "CA").trim() || "CA";
  const zip = String(
    order?.delivery_zip ||
      booking.zip ||
      extractZip(street) ||
      extractZip(`${street} ${city}`) ||
      extractZip(String(quote?.address || "")) ||
      ""
  ).trim();

  const combined = [street, city, state, zip].filter(Boolean).join(", ");
  const parsed =
    parseUsAddress(street) ||
    parseUsAddress(combined) ||
    (street.includes(",") ? parseUsAddress(street) : null);

  if (parsed && (parsed.zip || zip)) {
    return {
      street: parsed.street || street,
      city: parsed.city || city,
      state: parsed.state || state,
      zip: parsed.zip || zip,
      country: "US",
    };
  }

  if (street && city && zip) {
    // Street field may already be a full "123 Main St, San Jose, CA 95112"
    const asFull = parseUsAddress(street);
    if (asFull) return { ...asFull, country: "US" };
    return { street, city, state, zip, country: "US" };
  }

  if (street && zip) {
    const asFull = parseUsAddress(street);
    if (asFull) return { ...asFull, country: "US" };
    // City missing but ZIP present — Uber still accepts city from ZIP area; use booking city or "CA"
    return {
      street: street.split(",")[0]!.trim(),
      city: city || "San Jose",
      state,
      zip,
      country: "US",
    };
  }

  throw new Error(
    "This event has no delivery address on file. Open the event and confirm Address / City (or the linked order delivery fields), then try again."
  );
}

function phoneFromEvent(sources: DropoffSources): string {
  const raw =
    sources.order?.customer_phone ||
    sources.booking.customer_phone ||
    sources.quote?.customer_phone ||
    "";
  const phone = toE164(raw);
  if (!phone) {
    throw new Error(
      "This event has no guest phone on file. Uber needs it for dropoff contact."
    );
  }
  return phone;
}

function guestName(sources: DropoffSources): string {
  return (
    sources.booking.customer_name ||
    sources.order?.customer_name ||
    sources.quote?.customer_name ||
    "Guest"
  );
}

function manifestForBooking(booking: CateringBooking, lines: { name: string; quantity: number }[]) {
  if (lines.length) {
    return lines.map((line) => ({
      name: line.name.slice(0, 80) || "Catering item",
      quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
      size: "small" as const,
    }));
  }
  const summary = String(booking.items_summary || "").trim();
  if (summary) {
    return [{ name: summary.slice(0, 80), quantity: 1, size: "small" as const }];
  }
  return [
    {
      name: `Yogiplate catering · ${booking.guest_count || "?"} guests`,
      quantity: 1,
      size: "small" as const,
    },
  ];
}

async function saveUber(id: string, uber: UberDeliveryInfo | null) {
  await updateDb((db) => {
    const row = (db.catering_bookings || []).find((item) => item.id === id);
    if (!row) return;
    row.uber = uber;
    row.updated_at = new Date().toISOString();
  });
  return getBookingDetail(id);
}

function feeFrom(q: Record<string, unknown>) {
  return typeof q.fee === "number"
    ? q.fee
    : Number.isFinite(Number(q.fee))
      ? Number(q.fee)
      : null;
}

export async function scheduleUberForBooking(id: string, input: UberScheduleInput) {
  if (!uberConfigured()) {
    throw new Error("Uber Direct is not configured on this site.");
  }
  const detail = await getBookingDetail(id);
  if (!detail) throw new Error("Booking not found");
  const booking = detail.booking;
  const sources: DropoffSources = {
    booking,
    order: detail.order,
    quote: detail.quote,
  };

  const fulfillment = String(
    booking.delivery_or_pickup || (detail.order?.delivery_address ? "delivery" : "")
  ).toLowerCase();
  if (fulfillment === "pickup") {
    throw new Error("This event is marked pickup. Switch it to delivery first.");
  }

  const existing = booking.uber;
  const hasActive =
    Boolean(existing?.delivery_id) &&
    !uberIsTerminal(existing?.status || "") &&
    !existing?.cancelled_at;

  if (hasActive && !input.replace) {
    throw new Error(
      `Uber is already scheduled (${existing?.status || "active"}). Use Reschedule Uber after an address change, or Cancel Uber first.`
    );
  }

  if (hasActive && input.replace && existing?.delivery_id) {
    try {
      await cancelUberDelivery(existing.delivery_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not cancel the previous Uber trip before rescheduling: ${message}`
      );
    }
    await saveUber(id, {
      ...existing,
      status: "canceled",
      cancelled_at: new Date().toISOString(),
    });
  }

  const pickupDate = String(input.pickup_date || booking.event_date || "").trim();
  const pickupTime = String(input.pickup_time || "").trim();
  if (!pickupTime) {
    throw new Error("Set the kitchen pickup time in Pacific (HH:mm) before scheduling Uber.");
  }
  const pickupReadyIso = pacificCivilToUtcIso(pickupDate, pickupTime);
  const window = buildUberWindow(pickupReadyIso);

  const phone = phoneFromEvent(sources);
  const dropoff = dropoffFromEvent(sources);
  const dropoffSummary = formatDropoffSummary(dropoff);
  const pickup = pickupAddressParts();
  const lines = (detail.order_items || []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
  }));
  if (!lines.length && detail.quote?.items?.length) {
    for (const item of detail.quote.items) {
      lines.push({ name: item.name, quantity: item.quantity });
    }
  }

  let quote = await createUberQuote(pickup, dropoff, window);
  let quoteId = String(quote.id || "");
  if (!quoteId) throw new Error("Uber did not return a quote id.");
  let feeCents = feeFrom(quote);

  const deliveryPayload = (activeQuoteId: string) => ({
    quote_id: activeQuoteId,
    pickup_name: pickupName(),
    pickup_address: formatUberAddress(pickup),
    pickup_phone_number: pickupPhone(),
    dropoff_name: guestName(sources),
    dropoff_address: formatUberAddress(dropoff),
    dropoff_phone_number: phone,
    manifest_items: manifestForBooking(booking, lines),
    ...window,
  });

  let delivery: Record<string, unknown>;
  try {
    delivery = await createUberDelivery(deliveryPayload(quoteId));
  } catch {
    quote = await createUberQuote(pickup, dropoff, window);
    quoteId = String(quote.id || "");
    if (!quoteId) throw new Error("Uber did not return a quote id.");
    feeCents = feeFrom(quote);
    delivery = await createUberDelivery(deliveryPayload(quoteId));
  }

  const uber = mapUberDelivery(delivery, quoteId, feeCents, {
    pickup_ready_dt: pickupReadyIso,
    pickup_local_date: pickupDate,
    pickup_local_time: pickupTime,
    dropoff_summary: dropoffSummary,
  });
  if (!uber.delivery_id) throw new Error("Uber did not return a delivery id.");

  const next = await saveUber(id, uber);

  let sms: { ok: boolean; error?: string } = { ok: false, error: "SMS not configured" };
  if (smsConfigured() && phone) {
    const track = uber.tracking_url
      ? `\nTrack: ${uber.tracking_url}`
      : "\nA tracking link will appear once a driver is assigned.";
    const label = booking.order_number || booking.invoice_number || detail.order?.order_number;
    const verb = input.replace ? "updated" : "scheduled";
    const result = await sendSms(
      phone,
      `Yogiplate: Uber delivery ${verb} for your catering order${
        label ? ` (${label})` : ""
      }.${track}\nDropoff: ${dropoffSummary}`
    );
    sms = result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  return { detail: next, uber, sms };
}

export async function cancelUberForBooking(id: string) {
  if (!uberConfigured()) {
    throw new Error("Uber Direct is not configured on this site.");
  }
  const db = await getDb();
  const booking = (db.catering_bookings || []).find((row) => row.id === id);
  if (!booking) throw new Error("Booking not found");
  const existing = booking.uber;
  if (!existing?.delivery_id) throw new Error("No Uber delivery is scheduled for this event.");
  if (existing.cancelled_at || uberIsTerminal(existing.status)) {
    throw new Error("This Uber delivery is already finished or cancelled.");
  }

  await cancelUberDelivery(existing.delivery_id);
  const uber: UberDeliveryInfo = {
    ...existing,
    status: "canceled",
    cancelled_at: new Date().toISOString(),
  };
  return { detail: await saveUber(id, uber), uber };
}

export async function refreshUberForBooking(id: string) {
  if (!uberConfigured()) {
    throw new Error("Uber Direct is not configured on this site.");
  }
  const db = await getDb();
  const booking = (db.catering_bookings || []).find((row) => row.id === id);
  if (!booking) throw new Error("Booking not found");
  const existing = booking.uber;
  if (!existing?.delivery_id) throw new Error("No Uber delivery is scheduled for this event.");

  const delivery = await getUberDelivery(existing.delivery_id);
  const uber: UberDeliveryInfo = {
    ...existing,
    status: String(delivery.status || existing.status),
    tracking_url: trackingFromUber(delivery) || existing.tracking_url,
    pickup_eta:
      String(delivery.pickup_ready || delivery.pickup_eta || "") || existing.pickup_eta,
    dropoff_eta:
      String(delivery.dropoff_eta || delivery.dropoff_deadline || "") || existing.dropoff_eta,
  };
  if (uberIsTerminal(uber.status) && uber.status.toLowerCase().includes("cancel")) {
    uber.cancelled_at = uber.cancelled_at || new Date().toISOString();
  }
  return { detail: await saveUber(id, uber), uber };
}
