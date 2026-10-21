"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BookingDetail,
  BookingDetailPatch,
  EditableLine,
  MenuChoice,
} from "@/lib/booking-detail";
import {
  ADMIN_TZ_LABEL,
  formatAdminCivilDate,
  formatAdminDate,
  formatAdminDateTime,
  formatAdminEventTime,
} from "@/lib/admin-time";
import {
  MANUAL_PAYMENT_METHODS,
  paymentMethodLabel,
} from "@/lib/payment-methods";
import {
  chargeTotals,
  discountFromPercent,
  formatMoney,
  fromCents,
  lineCents,
  lineTotal,
  percentCents,
} from "@/lib/pricing";
import type { CateringBooking, OrderStatus } from "@/lib/types";
import { AdminCardPayment } from "@/components/AdminCardPayment";
import { AddressCheckNote, useAddressCheck } from "@/components/AddressCheck";

/** Paid / partial are set automatically when a payment is recorded (with method). */
const STATUS_OPTIONS: { value: CateringBooking["status"]; label: string }[] = [
  { value: "unconfirmed", label: "Unconfirmed (amber)" },
  { value: "quote_sent", label: "Quote sent (blue)" },
  { value: "order_placed", label: "Order placed (teal)" },
  { value: "invoice_sent", label: "Invoice sent (violet)" },
  { value: "confirmed", label: "Confirmed (green)" },
  { value: "cancelled", label: "Cancelled" },
];

const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "preparing", "delivered", "cancelled"];

type BookingForm = NonNullable<BookingDetailPatch["booking"]>;

function bookingForm(b: CateringBooking): BookingForm {
  return {
    event_date: b.event_date,
    event_time: b.event_time || "",
    status: b.status,
    customer_name: b.customer_name,
    customer_email: b.customer_email,
    customer_phone: b.customer_phone,
    guest_count: b.guest_count ?? null,
    diet: b.diet || "",
    occasion: b.occasion || "",
    meal: b.meal || "",
    delivery_or_pickup: b.delivery_or_pickup || "",
    city: b.city || "",
    address: b.address || "",
    setup_needs: b.setup_needs || "",
    special_requirements: b.special_requirements || "",
    notes: b.notes || "",
    admin_notes: b.admin_notes || "",
  };
}

function linesFrom(detail: BookingDetail): EditableLine[] {
  if (detail.order) {
    return detail.order_items.map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      name: item.name,
      unit_price: item.unit_price,
      quantity: item.quantity,
    }));
  }
  if (detail.quote) {
    return detail.quote.items.map((item) => ({
      menu_item_id: item.menu_item_id,
      name: item.name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      unit: item.unit,
    }));
  }
  return [];
}

function Field(props: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  wide?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={`block text-sm ${props.wide ? "sm:col-span-2" : ""}`}>
      <span className="font-semibold">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-white px-3 py-2"
      />
    </label>
  );
}

function Area(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm sm:col-span-2">
      <span className="font-semibold">{props.label}</span>
      <textarea
        rows={2}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-white px-3 py-2"
      />
    </label>
  );
}

export function BookingDetailDrawer(props: {
  bookingId: string;
  onClose: () => void;
  onChanged: (booking: CateringBooking) => void;
}) {
  const { bookingId, onClose, onChanged } = props;
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [form, setForm] = useState<BookingForm | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [deliveryMiles, setDeliveryMiles] = useState("0");
  const [setupFee, setSetupFee] = useState("0");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");
  const [menuQuery, setMenuQuery] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payNote, setPayNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  /** Pacific kitchen pickup day/time for Uber (date defaults to event day). */
  const [uberPickupDate, setUberPickupDate] = useState("");
  const [uberPickupTime, setUberPickupTime] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback(
    (next: BookingDetail) => {
      setDetail(next);
      setForm(bookingForm(next.booking));
      setLines(linesFrom(next));
      setDeliveryFee(
        String(
          next.order?.delivery_fee ??
            (next.booking.delivery_or_pickup === "pickup" ? 0 : next.base_delivery_fee)
        )
      );
      setSetupFee(String(next.order?.setup_fee ?? 0));
      setDeliveryMiles(String(next.order?.delivery_miles ?? 0));
      const pct = next.order?.discount_percent;
      if (pct != null && pct > 0) {
        setDiscountPercent(String(pct));
      } else if (next.order && next.order.discount > 0 && next.order.subtotal > 0) {
        setDiscountPercent(
          String(Math.round((next.order.discount / next.order.subtotal) * 1000) / 10)
        );
      } else {
        setDiscountPercent("");
      }
      setDiscountReason(next.order?.discount_reason || "");
      setOrderStatus(next.order?.status || "pending");
      setUberPickupDate(
        next.booking.uber?.pickup_local_date || next.booking.event_date || ""
      );
      setUberPickupTime(
        next.booking.uber?.pickup_local_time ||
          (next.booking.event_time || "").slice(0, 5) ||
          ""
      );
      onChanged(next.booking);
    },
    [onChanged]
  );

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setNotice(null);
    (async () => {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error || "Could not load this booking.");
        return;
      }
      apply(data as BookingDetail);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, apply]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Priced as an order (delivery, discount, tax) unless the event only has a quote. */
  const orderMode = Boolean(detail && (detail.order || !detail.quote));

  const preview = useMemo(() => {
    const subtotalCents = lines.reduce(
      (sum, line) => sum + lineCents(Number(line.unit_price) || 0, Number(line.quantity) || 0),
      0
    );
    const subtotal = fromCents(subtotalCents);
    const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    if (detail && orderMode && (detail.order || lines.length)) {
      return chargeTotals({
        subtotal,
        discount: discountFromPercent(subtotal, pct),
        deliveryFee: Number(deliveryFee) || 0,
        setupFee: Number(setupFee) || 0,
        taxRate: detail.tax_rate,
      });
    }
    return { subtotal, discount: 0, delivery_fee: 0, setup_fee: 0, tax: 0, total: subtotal };
  }, [lines, discountPercent, deliveryFee, setupFee, detail, orderMode]);

  const addressCheck = useAddressCheck({
    address: form?.address || "",
    city: form?.city || "",
    zip: detail?.order?.delivery_zip || "",
    requireZip: false,
    subtotal: preview.subtotal,
    enabled: Boolean(form) && form?.delivery_or_pickup !== "pickup",
  });

  const menuMatches = useMemo(() => {
    const words = menuQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (detail?.menu || [])
      .filter((choice) => {
        const hay = `${choice.name} ${choice.category}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 30);
  }, [detail, menuQuery]);

  function addFromMenu(choice: MenuChoice | undefined) {
    if (!choice) return;
    setLines((rows) => {
      const same = rows.findIndex(
        (row) => row.menu_item_id === choice.menu_item_id && row.name === choice.name
      );
      if (same >= 0) {
        return rows.map((row, i) =>
          i === same ? { ...row, quantity: (Number(row.quantity) || 0) + 1 } : row
        );
      }
      return [
        ...rows,
        {
          menu_item_id: choice.menu_item_id,
          name: choice.name,
          unit_price: choice.unit_price,
          quantity: choice.min_quantity,
          unit: choice.unit,
        },
      ];
    });
    setMenuQuery("");
  }

  const depositPreview = detail?.quote
    ? fromCents(percentCents(Math.round(preview.total * 100), detail.quote.deposit_percent))
    : null;
  const paid = detail?.amount_paid ?? 0;
  const balance = fromCents(Math.max(0, Math.round(preview.total * 100) - Math.round(paid * 100)));

  function setLine(index: number, patch: Partial<EditableLine>) {
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function send(method: "PATCH" | "POST", body: unknown, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save.");
        return false;
      }
      apply(data as BookingDetail);
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!form || !detail) return;
    const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    if (pct > 0 && !discountReason.trim()) {
      setError("Add a reason when applying a discount.");
      return;
    }
    const patch: BookingDetailPatch = { booking: form };
    const startsOrder = !detail.order && !detail.quote && lines.length > 0;
    if (detail.order || startsOrder) {
      const subtotalCents = lines.reduce(
        (sum, line) => sum + lineCents(Number(line.unit_price) || 0, Number(line.quantity) || 0),
        0
      );
      patch.order = {
        items: lines,
        delivery_fee: Number(deliveryFee) || 0,
        delivery_miles: Number(deliveryMiles) || 0,
        setup_fee: Number(setupFee) || 0,
        discount: discountFromPercent(fromCents(subtotalCents), pct),
        discount_percent: pct > 0 ? pct : null,
        discount_reason: pct > 0 ? discountReason.trim() : null,
        status: orderStatus,
      };
    } else if (detail.quote) {
      patch.quote_items = lines;
    }
    if (await send("PATCH", patch, "save")) {
      setNotice(startsOrder ? "Order created for this event. Saved." : "Saved.");
    }
  }

  async function recordPayment() {
    if (!(Number(payAmount) > 0)) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (!payMethod) {
      setError("Choose how the payment was collected before recording it.");
      return;
    }
    const ok = await send(
      "POST",
      {
        action: "payment",
        amount: Number(payAmount),
        method: payMethod,
        note: payNote.trim() || undefined,
      },
      "payment"
    );
    if (ok) {
      setPayAmount("");
      setPayMethod("");
      setPayNote("");
      setNotice(
        "Payment recorded. Calendar color updates to partial (orange) or paid in full (green)."
      );
    }
  }

  async function emailInvoice() {
    if (await send("POST", { action: "email_invoice" }, "email")) {
      setNotice("Invoice emailed to the guest.");
    }
  }

  async function issueRefund(full: boolean) {
    if (!detail?.can_refund) {
      setError("Only the owner account can issue refunds.");
      return;
    }
    const amount = full ? paid : Number(refundAmount);
    if (!(amount > 0)) {
      setError("Enter a refund amount greater than zero.");
      return;
    }
    if (amount > paid + 0.001) {
      setError(`Refund cannot exceed the amount paid (${formatMoney(paid)}).`);
      return;
    }
    const note = refundNote.trim();
    if (!note) {
      setError("Enter a reason for this refund.");
      return;
    }
    if (
      !window.confirm(
        full
          ? `Refund the full ${formatMoney(paid)} paid on this event?`
          : `Refund ${formatMoney(amount)} of the ${formatMoney(paid)} paid on this event?`
      )
    ) {
      return;
    }
    if (
      await send(
        "POST",
        { action: "refund", amount, note, full },
        "refund"
      )
    ) {
      setRefundAmount("");
      setRefundNote("");
      setNotice(full ? "Full refund recorded." : `Refund of ${formatMoney(amount)} recorded.`);
    }
  }

  async function cancelInvoice() {
    const reason = cancelReason.trim();
    if (!reason) {
      setError("Enter a reason for cancelling this invoice. The guest will receive it by email.");
      return;
    }
    if (
      !window.confirm(
        "Cancel this invoice? The guest will be emailed the reason, the pay link will stop working, and the calendar event will show as cancelled."
      )
    ) {
      return;
    }
    if (await send("POST", { action: "cancel_invoice", reason }, "cancel")) {
      setCancelReason("");
      setNotice("Invoice cancelled. Guest emailed and pay link closed.");
    }
  }

  async function scheduleUber(replace = false) {
    if (!uberPickupDate.trim()) {
      setError(`Set the Uber pickup date in ${ADMIN_TZ_LABEL} time.`);
      return;
    }
    if (!uberPickupTime.trim()) {
      setError(`Set the kitchen pickup time in ${ADMIN_TZ_LABEL} (HH:mm).`);
      return;
    }
    const confirmMsg = replace
      ? `Cancel the current Uber trip and schedule a new one to the event’s current delivery address?\n\nKitchen pickup: ${uberPickupDate} at ${uberPickupTime} ${ADMIN_TZ_LABEL}\n\nThe guest will get a new tracking SMS.`
      : `Schedule Uber for kitchen pickup ${uberPickupDate} at ${uberPickupTime} ${ADMIN_TZ_LABEL}? The guest will get an SMS with the tracking link when available.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setBusy(replace ? "uber_reschedule" : "uber_schedule");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uber_schedule",
          pickup_date: uberPickupDate.trim(),
          pickup_time: uberPickupTime.trim(),
          replace,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not schedule Uber.");
        return;
      }
      apply(data as BookingDetail);
      const sms = data.uber_sms as { ok?: boolean; error?: string } | undefined;
      const done = replace ? "Uber rescheduled to the current address." : "Uber scheduled.";
      setNotice(
        sms?.ok
          ? `${done} Guest SMS sent.`
          : `${done}${sms?.error ? ` SMS: ${sms.error}` : " Guest SMS was not sent."}`
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancelUber() {
    if (!window.confirm("Cancel the Uber courier for this event?")) return;
    if (await send("POST", { action: "uber_cancel" }, "uber_cancel")) {
      setNotice("Uber delivery cancelled.");
    }
  }

  async function refreshUber() {
    if (await send("POST", { action: "uber_refresh" }, "uber_refresh")) {
      setNotice("Uber status refreshed.");
    }
  }

  const b = detail?.booking;
  const invoiceCancelled =
    detail?.booking.status === "cancelled" || detail?.order?.status === "cancelled";
  const canCancelInvoice =
    Boolean(detail?.invoice) &&
    !invoiceCancelled &&
    balance > 0;
  const update = (patch: Partial<BookingForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto bg-warm p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Booking detail"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Calendar event</p>
            <h3 className="font-display mt-1 text-3xl text-foreground">
              {b?.customer_name || (detail ? "Guest" : "Loading…")}
            </h3>
            {b ? (
              <p className="mt-1 text-sm text-muted">
                {formatAdminCivilDate(b.event_date)}
                {b.event_time ? ` · ${formatAdminEventTime(b.event_time)}` : ""}
                {[detail?.order?.order_number, detail?.quote?.quote_number, detail?.invoice?.invoice_number]
                  .filter(Boolean)
                  .map((n) => ` · ${n}`)
                  .join("")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-accent-deep underline"
          >
            Close
          </button>
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm font-medium text-emerald-800">{notice}</p> : null}

        {detail && form ? (
          <>
            <section className="mt-6 grid gap-3 border border-line bg-white p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted">Total</p>
                <p className="text-lg font-semibold">{formatMoney(preview.total)}</p>
              </div>
              <div>
                <p className="text-muted">Paid</p>
                <p className="text-lg font-semibold">{formatMoney(paid)}</p>
              </div>
              <div>
                <p className="text-muted">Balance</p>
                <p className="text-lg font-semibold">{formatMoney(balance)}</p>
              </div>
              <div>
                <p className="text-muted">Payments</p>
                <p className="text-lg font-semibold">
                  {detail.order?.payments?.length ?? detail.booking.payments?.length ?? 0}
                </p>
              </div>
            </section>

            <section className="mt-6">
              <h4 className="font-display text-xl text-foreground">Event and guest</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-semibold">Calendar status</span>
                  <select
                    value={form.status}
                    onChange={(e) => update({ status: e.target.value as CateringBooking["status"] })}
                    className="mt-1 w-full border border-line bg-white px-3 py-2"
                  >
                    {form.status === "partial" ? (
                      <option value="partial">Partial payment (orange) — from payments</option>
                    ) : null}
                    {form.status === "paid" ? (
                      <option value="paid">Paid in full (green) — from payments</option>
                    ) : null}
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted">
                    Orange / green payment colors update when you record a payment below (collection
                    method required).
                  </span>
                </label>
                {detail.order ? (
                  <label className="block text-sm">
                    <span className="font-semibold">Order status</span>
                    <select
                      value={orderStatus}
                      onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                      className="mt-1 w-full border border-line bg-white px-3 py-2 capitalize"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span />
                )}
                <Field label="Event date" type="date" value={form.event_date || ""} onChange={(v) => update({ event_date: v })} />
                <Field label="Event time" value={form.event_time || ""} placeholder="HH:mm" onChange={(v) => update({ event_time: v })} />
                <Field label="Name" value={form.customer_name || ""} onChange={(v) => update({ customer_name: v })} />
                <Field
                  label="Guests"
                  type="number"
                  value={form.guest_count ?? ""}
                  onChange={(v) => update({ guest_count: v ? Number(v) : null })}
                />
                <Field label="Email" value={form.customer_email || ""} onChange={(v) => update({ customer_email: v })} />
                <Field label="Phone" value={form.customer_phone || ""} onChange={(v) => update({ customer_phone: v })} />
                <Field label="Diet" value={form.diet || ""} onChange={(v) => update({ diet: v })} />
                <Field label="Occasion" value={form.occasion || ""} onChange={(v) => update({ occasion: v })} />
                <Field label="Meal" value={form.meal || ""} onChange={(v) => update({ meal: v })} />
                <label className="block text-sm">
                  <span className="font-semibold">Delivery / pickup</span>
                  <select
                    value={form.delivery_or_pickup || ""}
                    onChange={(e) => update({ delivery_or_pickup: e.target.value })}
                    className="mt-1 w-full border border-line bg-white px-3 py-2"
                  >
                    <option value="">—</option>
                    <option value="delivery">Delivery</option>
                    <option value="pickup">Pickup</option>
                  </select>
                </label>
                <Field label="Address" wide value={form.address || ""} onChange={(v) => update({ address: v })} />
                <Field label="City" value={form.city || ""} onChange={(v) => update({ city: v })} />
                <span />
                <div className="space-y-2 sm:col-span-2">
                  <AddressCheckNote check={addressCheck} />
                  {addressCheck.status === "ok" && orderMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryFee(String(addressCheck.fee));
                        setDeliveryMiles(String(addressCheck.miles));
                      }}
                      className="border border-accent-deep px-3 py-1.5 text-xs font-semibold text-accent-deep"
                    >
                      Use {addressCheck.miles} mi · {formatMoney(addressCheck.fee)} delivery
                    </button>
                  ) : null}
                </div>
                <Area label="Special requirements" value={form.special_requirements || ""} onChange={(v) => update({ special_requirements: v })} />
                <Area label="Setup needs" value={form.setup_needs || ""} onChange={(v) => update({ setup_needs: v })} />
                <Area label="Guest notes" value={form.notes || ""} onChange={(v) => update({ notes: v })} />
                <Area label="Admin notes" value={form.admin_notes || ""} onChange={(v) => update({ admin_notes: v })} />
              </div>
            </section>

            {form.delivery_or_pickup !== "pickup" ? (
              <section className="mt-8 border border-line bg-white p-4">
                <h4 className="font-display text-xl text-foreground">Uber delivery</h4>
                <p className="mt-1 text-sm text-muted">
                  Guest, phone, and dropoff come from this event. Changing the address on the event
                  does not update an Uber trip already created — use Reschedule Uber for that.
                </p>
                {(detail.order?.delivery_address || form.address) && (
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Event dropoff now:</span>{" "}
                    {[
                      detail.order?.delivery_address || form.address,
                      detail.order?.delivery_city || form.city,
                      detail.order
                        ? `${detail.order.delivery_state || "CA"} ${detail.order.delivery_zip || ""}`.trim()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-semibold">Pickup day ({ADMIN_TZ_LABEL})</span>
                    <input
                      type="date"
                      value={uberPickupDate}
                      onChange={(e) => setUberPickupDate(e.target.value)}
                      className="mt-1 w-full border border-line bg-white px-3 py-2"
                    />
                    <span className="mt-1 block text-xs text-muted">
                      Defaults to the event day; change only if pickup is a different Pacific day.
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold">Pickup time ({ADMIN_TZ_LABEL})</span>
                    <input
                      type="time"
                      value={uberPickupTime}
                      onChange={(e) => setUberPickupTime(e.target.value)}
                      required
                      className="mt-1 w-full border border-line bg-white px-3 py-2"
                    />
                    <span className="mt-1 block text-xs text-muted">
                      Required. When food is ready at the kitchen for the courier.
                    </span>
                  </label>
                </div>
                {detail.booking.uber?.delivery_id ? (
                  <div className="mt-3 space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">Status:</span>{" "}
                      {detail.booking.uber.status || "—"}
                      {detail.booking.uber.cancelled_at ? " (cancelled)" : ""}
                    </p>
                    {detail.booking.uber.dropoff_summary ? (
                      <p>
                        <span className="font-semibold">Uber dropoff (on tracking):</span>{" "}
                        {detail.booking.uber.dropoff_summary}
                      </p>
                    ) : null}
                    {!detail.booking.uber.cancelled_at &&
                    detail.booking.uber.dropoff_summary &&
                    (detail.order?.delivery_address || form.address) ? (
                      <p className="font-medium text-amber-800">
                        If you changed the event address, the tracking link still uses the Uber
                        dropoff above until you Reschedule Uber.
                      </p>
                    ) : null}
                    {detail.booking.uber.pickup_local_date ||
                    detail.booking.uber.pickup_ready_dt ? (
                      <p>
                        <span className="font-semibold">Pickup:</span>{" "}
                        {detail.booking.uber.pickup_local_date &&
                        detail.booking.uber.pickup_local_time
                          ? `${detail.booking.uber.pickup_local_date} ${formatAdminEventTime(
                              detail.booking.uber.pickup_local_time
                            )}`
                          : formatAdminDateTime(detail.booking.uber.pickup_ready_dt)}
                      </p>
                    ) : null}
                    <p className="break-all">
                      <span className="font-semibold">Delivery ID:</span>{" "}
                      {detail.booking.uber.delivery_id}
                    </p>
                    {detail.booking.uber.fee_cents != null ? (
                      <p>
                        <span className="font-semibold">Uber fee:</span>{" "}
                        {formatMoney(detail.booking.uber.fee_cents / 100)}
                      </p>
                    ) : null}
                    {detail.booking.uber.tracking_url ? (
                      <p>
                        <a
                          href={detail.booking.uber.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-accent-deep underline"
                        >
                          Open tracking
                        </a>
                      </p>
                    ) : (
                      <p className="text-muted">Tracking link appears once a driver is assigned.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">No Uber courier scheduled yet.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.uber_configured ? (
                    <>
                      {!(
                        detail.booking.uber?.delivery_id &&
                        !detail.booking.uber.cancelled_at &&
                        !["delivered", "canceled", "cancelled", "returned", "failed"].includes(
                          (detail.booking.uber.status || "").toLowerCase()
                        )
                      ) ? (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void scheduleUber(false)}
                          className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === "uber_schedule" ? "Scheduling…" : "Schedule Uber"}
                        </button>
                      ) : null}
                      {detail.booking.uber?.delivery_id && !detail.booking.uber.cancelled_at ? (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void scheduleUber(true)}
                            className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {busy === "uber_reschedule"
                              ? "Rescheduling…"
                              : "Reschedule Uber (new address)"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void refreshUber()}
                            className="border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            {busy === "uber_refresh" ? "Refreshing…" : "Refresh status"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void cancelUber()}
                            className="border border-red-700 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                          >
                            {busy === "uber_cancel" ? "Cancelling…" : "Cancel Uber"}
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-amber-800">
                      Uber Direct env vars are not set on this deploy, so scheduling is unavailable.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            <section className="mt-8">
              <h4 className="font-display text-xl text-foreground">
                {detail.order ? "Order" : detail.quote ? "Quote menu" : "Menu"}
              </h4>
              <>
                {!detail.order && !detail.quote ? (
                  <p className="mt-2 text-sm text-muted">
                    {lines.length
                      ? "Save changes to create an order and invoice for this event."
                      : "No menu yet. Pick dishes below to start an order for this event."}
                    {b?.items_summary ? ` Requested: ${b.items_summary}` : ""}
                  </p>
                ) : null}
                {lines.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="py-2 pr-2 font-semibold">Item</th>
                          <th className="w-20 py-2 pr-2 font-semibold">Qty</th>
                          <th className="w-28 py-2 pr-2 font-semibold">Unit price</th>
                          <th className="w-28 py-2 pr-2 text-right font-semibold">Line total</th>
                          <th className="w-10 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={line.id || `${line.menu_item_id}-${index}`} className="border-b border-line/70">
                            <td className="py-2 pr-2">
                              <input
                                value={line.name}
                                onChange={(e) => setLine(index, { name: e.target.value })}
                                className="w-full border border-line bg-white px-2 py-1"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={line.quantity}
                                onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                                className="w-full border border-line bg-white px-2 py-1"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unit_price}
                                onChange={(e) => setLine(index, { unit_price: Number(e.target.value) })}
                                className="w-full border border-line bg-white px-2 py-1"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {formatMoney(lineTotal(Number(line.unit_price) || 0, Number(line.quantity) || 0))}
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                                className="text-sm font-semibold text-red-700"
                                aria-label={`Remove ${line.name}`}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="relative min-w-[16rem] flex-1 text-sm">
                      <label className="block">
                        <span className="font-semibold">Add from menu</span>
                        <input
                          type="search"
                          value={menuQuery}
                          onChange={(e) => setMenuQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addFromMenu(menuMatches[0]);
                            }
                            if (e.key === "Escape") setMenuQuery("");
                          }}
                          placeholder="Search dishes, e.g. paneer, dal, half tray, lassi"
                          className="mt-1 w-full border border-line bg-white px-3 py-2"
                        />
                      </label>
                      {menuQuery.trim() ? (
                        <ul className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto border border-line bg-white shadow-lg">
                          {menuMatches.length ? (
                            menuMatches.map((choice) => (
                              <li key={choice.key}>
                                <button
                                  type="button"
                                  onClick={() => addFromMenu(choice)}
                                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-accent-soft"
                                >
                                  <span>
                                    <span className="font-medium">{choice.name}</span>
                                    <span className="ml-2 text-xs text-muted">{choice.category}</span>
                                  </span>
                                  <span className="shrink-0 text-xs font-semibold">
                                    {formatMoney(choice.unit_price)} / {choice.unit}
                                  </span>
                                </button>
                              </li>
                            ))
                          ) : (
                            <li className="px-3 py-2 text-muted">No dishes match “{menuQuery.trim()}”.</li>
                          )}
                        </ul>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((rows) => [
                          ...rows,
                          { menu_item_id: "custom", name: "Custom item", unit_price: 0, quantity: 1 },
                        ])
                      }
                      className="border border-line px-3 py-2 text-sm font-semibold"
                    >
                      Add custom line
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {orderMode ? (
                      <>
                        <Field label="Distance (mi)" type="number" value={deliveryMiles} onChange={setDeliveryMiles} />
                        <Field label="Delivery fee" type="number" value={deliveryFee} onChange={setDeliveryFee} />
                        <Field
                          label="Discount %"
                          type="number"
                          value={discountPercent}
                          onChange={setDiscountPercent}
                        />
                        <Field
                          label="Discount reason"
                          value={discountReason}
                          onChange={setDiscountReason}
                        />
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={Number(setupFee) > 0}
                            onChange={(e) =>
                              setSetupFee(e.target.checked ? String(detail.setup_fee) : "0")
                            }
                          />
                          Full on-site setup ({formatMoney(detail.setup_fee)})
                        </label>
                        {Number(setupFee) > 0 ? (
                          <Field label="Setup fee" type="number" value={setupFee} onChange={setSetupFee} />
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <dl className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt>Subtotal</dt>
                      <dd>{formatMoney(preview.subtotal)}</dd>
                    </div>
                    {orderMode ? (
                      <>
                        <div className="flex justify-between">
                          <dt>Distance</dt>
                          <dd>{Number(deliveryMiles) || 0} mi</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Delivery</dt>
                          <dd>{formatMoney(preview.delivery_fee)}</dd>
                        </div>
                        {preview.setup_fee > 0 ? (
                          <div className="flex justify-between">
                            <dt>Setup</dt>
                            <dd>{formatMoney(preview.setup_fee)}</dd>
                          </div>
                        ) : null}
                        {preview.discount > 0 ? (
                          <div className="flex justify-between">
                            <dt>
                              Discount
                              {Number(discountPercent) > 0 ? ` (${discountPercent}%` : ""}
                              {Number(discountPercent) > 0 && discountReason.trim()
                                ? ` — ${discountReason.trim()}`
                                : ""}
                              {Number(discountPercent) > 0 ? ")" : ""}
                            </dt>
                            <dd>−{formatMoney(preview.discount)}</dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between">
                          <dt>Tax ({(detail.tax_rate * 100).toFixed(2)}%)</dt>
                          <dd>{formatMoney(preview.tax)}</dd>
                        </div>
                      </>
                    ) : null}
                    <div className="flex justify-between text-base font-semibold">
                      <dt>Total</dt>
                      <dd>{formatMoney(preview.total)}</dd>
                    </div>
                    {depositPreview != null && !detail.order ? (
                      <div className="flex justify-between text-muted">
                        <dt>Deposit ({detail.quote?.deposit_percent}%)</dt>
                        <dd>{formatMoney(depositPreview)}</dd>
                      </div>
                    ) : null}
                  </dl>
              </>
            </section>

            <section className="mt-8">
              <h4 className="font-display text-xl text-foreground">Payments</h4>
              <p className="mt-1 text-sm text-muted">
                Record cash, Zelle, check, and other offline payments here. You must say how it was
                collected. Partial → orange on the calendar; paid in full → green.
              </p>
              {(detail.order?.payments || detail.booking.payments || []).length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {(detail.order?.payments || detail.booking.payments || []).map((payment) => (
                    <li key={payment.id} className="flex justify-between border-b border-line/70 py-1">
                      <span>
                        {formatAdminDate(payment.paid_at)} ·{" "}
                        {payment.note ||
                          paymentMethodLabel(payment.method) ||
                          (payment.amount < 0
                            ? "Refund"
                            : payment.stripe_session_id?.startsWith("cs_")
                              ? "Card (Stripe)"
                              : "Payment")}
                      </span>
                      <span
                        className={`font-semibold ${
                          payment.amount < 0 ? "text-red-800" : ""
                        }`}
                      >
                        {formatMoney(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No payments yet.</p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Amount"
                  type="number"
                  value={payAmount}
                  onChange={setPayAmount}
                  placeholder="0.00"
                />
                <label className="block text-sm">
                  <span className="font-semibold">
                    Collected via <span className="text-red-700">*</span>
                  </span>
                  <select
                    required
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="mt-1 w-full border border-line bg-white px-3 py-2"
                  >
                    <option value="">Select how payment was collected…</option>
                    {MANUAL_PAYMENT_METHODS.map((row) => (
                      <option key={row.value} value={row.value}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <Field
                    label="Extra note (optional)"
                    value={payNote}
                    onChange={setPayNote}
                    placeholder="Check #, Zelle name, last 4 digits…"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy !== null || !(Number(payAmount) > 0) || !payMethod}
                  onClick={() => void recordPayment()}
                  className="bg-accent-deep px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
                >
                  {busy === "payment" ? "Recording…" : "Record payment"}
                </button>
              </div>
            </section>

            {detail.can_refund && paid > 0 && detail.order ? (
              <section className="mt-8 border border-red-200 bg-white p-4">
                <h4 className="font-display text-xl text-red-900">Refund (owner only)</h4>
                <p className="mt-1 text-sm text-muted">
                  Refund any amount up to {formatMoney(paid)} paid on this event. Card charges go
                  back through Stripe when possible; cash/Zelle refunds are recorded on the ledger.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Refund amount"
                    type="number"
                    value={refundAmount}
                    onChange={setRefundAmount}
                    placeholder="0.00"
                  />
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-foreground">
                      Reason (required)
                      <textarea
                        value={refundNote}
                        onChange={(e) => setRefundNote(e.target.value)}
                        rows={2}
                        placeholder="e.g. Guest cancelled; overcharge; menu change"
                        className="mt-1 w-full border border-line px-3 py-2 font-medium"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={
                      busy !== null || !(Number(refundAmount) > 0) || !refundNote.trim()
                    }
                    onClick={() => void issueRefund(false)}
                    className="border border-red-700 px-3 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-50"
                  >
                    {busy === "refund" ? "Refunding…" : "Refund this amount"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null || !refundNote.trim()}
                    onClick={() => void issueRefund(true)}
                    className="bg-red-800 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "refund" ? "Refunding…" : `Refund all paid (${formatMoney(paid)})`}
                  </button>
                </div>
              </section>
            ) : null}

            {detail ? (
              <AdminCardPayment
                bookingId={bookingId}
                balance={balance}
                hasOrder={Boolean(detail.order)}
                onPaid={(next) => {
                  apply(next);
                  setNotice("Card payment accepted.");
                }}
              />
            ) : null}

            <div className="sticky bottom-0 mt-8 flex flex-wrap gap-3 border-t border-line bg-warm py-4">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void save()}
                className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
              {detail.invoice && !invoiceCancelled && !detail.invoice.email_sent_at && detail.order ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    const orderId = detail.order!.id;
                    if (window.location.pathname.startsWith("/admin/desk")) {
                      window.dispatchEvent(new CustomEvent("yogiplate-edit-invoice", { detail: orderId }));
                      return;
                    }
                    window.location.href = `/admin/desk?invoice=${encodeURIComponent(orderId)}`;
                  }}
                  className="border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Edit on desk
                </button>
              ) : null}
              {detail.invoice && !invoiceCancelled ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void emailInvoice()}
                  className="border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {busy === "email" ? "Sending…" : "Email invoice to guest"}
                </button>
              ) : null}
              {detail.invoice?.pay_url && balance > 0 && !invoiceCancelled ? (
                <a
                  href={detail.invoice.pay_url}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-line px-4 py-2.5 text-sm font-semibold"
                >
                  Open pay link
                </a>
              ) : null}
              {canCancelInvoice ? (
                <div className="w-full space-y-2 border border-red-200 bg-white p-3">
                  <label className="block text-sm font-semibold text-red-900">
                    Reason for cancelling (required — emailed to guest)
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Event date changed; guest asked to hold; kitchen cannot fulfill"
                      className="mt-1 w-full border border-line px-3 py-2 font-medium text-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy !== null || !cancelReason.trim()}
                    onClick={() => void cancelInvoice()}
                    className="border border-red-700 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-50"
                  >
                    {busy === "cancel" ? "Cancelling…" : "Cancel invoice & email guest"}
                  </button>
                </div>
              ) : null}
              {invoiceCancelled ? (
                <p className="w-full text-sm font-medium text-red-800">
                  Invoice cancelled — pay link closed.
                </p>
              ) : null}
            </div>
          </>
        ) : !error ? (
          <p className="mt-6 text-sm text-muted">Loading the order…</p>
        ) : null}
      </aside>
    </div>
  );
}
