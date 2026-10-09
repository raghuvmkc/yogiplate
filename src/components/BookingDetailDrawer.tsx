"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BookingDetail,
  BookingDetailPatch,
  EditableLine,
  MenuChoice,
} from "@/lib/booking-detail";
import {
  chargeTotals,
  formatMoney,
  fromCents,
  lineCents,
  lineTotal,
  percentCents,
} from "@/lib/pricing";
import type { CateringBooking, OrderStatus } from "@/lib/types";
import { AddressCheckNote, useAddressCheck } from "@/components/AddressCheck";

const STATUS_OPTIONS: { value: CateringBooking["status"]; label: string }[] = [
  { value: "unconfirmed", label: "Unconfirmed (amber)" },
  { value: "quote_sent", label: "Quote sent (blue)" },
  { value: "order_placed", label: "Order placed (teal)" },
  { value: "invoice_sent", label: "Invoice sent (violet)" },
  { value: "partial", label: "Partial payment (orange)" },
  { value: "paid", label: "Paid in full (green)" },
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
  const [setupFee, setSetupFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");
  const [menuQuery, setMenuQuery] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
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
      setDiscount(String(next.order?.discount ?? 0));
      setOrderStatus(next.order?.status || "pending");
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
    if (detail && orderMode && (detail.order || lines.length)) {
      return chargeTotals({
        subtotal,
        discount: Number(discount) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        setupFee: Number(setupFee) || 0,
        taxRate: detail.tax_rate,
      });
    }
    return { subtotal, discount: 0, delivery_fee: 0, setup_fee: 0, tax: 0, total: subtotal };
  }, [lines, discount, deliveryFee, setupFee, detail, orderMode]);

  const addressCheck = useAddressCheck({
    address: form?.address || "",
    city: form?.city || "",
    zip: "",
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
    const patch: BookingDetailPatch = { booking: form };
    const startsOrder = !detail.order && !detail.quote && lines.length > 0;
    if (detail.order || startsOrder) {
      patch.order = {
        items: lines,
        delivery_fee: Number(deliveryFee) || 0,
        setup_fee: Number(setupFee) || 0,
        discount: Number(discount) || 0,
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
    const ok = await send(
      "POST",
      { action: "payment", amount: Number(payAmount), note: payNote },
      "payment"
    );
    if (ok) {
      setPayAmount("");
      setPayNote("");
      setNotice("Payment recorded.");
    }
  }

  async function emailInvoice() {
    if (await send("POST", { action: "email_invoice" }, "email")) {
      setNotice("Invoice emailed to the guest.");
    }
  }

  const b = detail?.booking;
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
                {b.event_date}
                {b.event_time ? ` ${b.event_time}` : ""}
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
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                  {addressCheck.status === "ok" && orderMode && Number(deliveryFee) !== addressCheck.fee ? (
                    <button
                      type="button"
                      onClick={() => setDeliveryFee(String(addressCheck.fee))}
                      className="border border-accent-deep px-3 py-1.5 text-xs font-semibold text-accent-deep"
                    >
                      Use {formatMoney(addressCheck.fee)} delivery fee
                    </button>
                  ) : null}
                </div>
                <Area label="Special requirements" value={form.special_requirements || ""} onChange={(v) => update({ special_requirements: v })} />
                <Area label="Setup needs" value={form.setup_needs || ""} onChange={(v) => update({ setup_needs: v })} />
                <Area label="Guest notes" value={form.notes || ""} onChange={(v) => update({ notes: v })} />
                <Area label="Admin notes" value={form.admin_notes || ""} onChange={(v) => update({ admin_notes: v })} />
              </div>
            </section>

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
                        <Field label="Delivery fee" type="number" value={deliveryFee} onChange={setDeliveryFee} />
                        <Field label="Discount" type="number" value={discount} onChange={setDiscount} />
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
                            <dt>Discount</dt>
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
              {(detail.order?.payments || detail.booking.payments || []).length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {(detail.order?.payments || detail.booking.payments || []).map((payment) => (
                    <li key={payment.id} className="flex justify-between border-b border-line/70 py-1">
                      <span>
                        {payment.paid_at.slice(0, 10)} · {payment.note || "Payment"}
                        {payment.stripe_session_id?.startsWith("cs_") ? " · Stripe" : ""}
                      </span>
                      <span className="font-semibold">{formatMoney(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No payments yet.</p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <Field label="Amount" type="number" value={payAmount} onChange={setPayAmount} placeholder="0.00" />
                <Field label="Note" value={payNote} onChange={setPayNote} placeholder="Cash, check, Zelle…" />
                <button
                  type="button"
                  disabled={busy !== null || !(Number(payAmount) > 0)}
                  onClick={() => void recordPayment()}
                  className="border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {busy === "payment" ? "Recording…" : "Record payment"}
                </button>
              </div>
            </section>

            <div className="sticky bottom-0 mt-8 flex flex-wrap gap-3 border-t border-line bg-warm py-4">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void save()}
                className="bg-accent-deep px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
              {detail.invoice ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void emailInvoice()}
                  className="border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {busy === "email" ? "Sending…" : "Email invoice to guest"}
                </button>
              ) : null}
              {detail.invoice?.pay_url && balance > 0 ? (
                <a
                  href={detail.invoice.pay_url}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-line px-4 py-2.5 text-sm font-semibold"
                >
                  Open pay link
                </a>
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
