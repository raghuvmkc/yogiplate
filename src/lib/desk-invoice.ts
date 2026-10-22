import {
  appendPaymentRecord,
  upsertCateringBooking,
} from "@/lib/calendar-bookings";
import { deliveryProblem, quoteDelivery } from "@/lib/delivery";
import { GuestInputError } from "@/lib/guest-error";
import { buildInvoiceHtml, emailPaymentReceived, sendInvoiceEmail } from "@/lib/invoice";
import {
  cartSubtotal,
  chargeTotals,
  discountFromPercent,
  formatMoney,
  fromCents,
  isPaidInFull,
  lineTotal,
  parseMoneyInput,
  setupFeeFor,
  setupNeedsLabel,
  toCents,
} from "@/lib/pricing";
import { sendGuestQuoteSmtp, smtpConfigured } from "@/lib/smtp";
import { ensureFreshInvoicePayLink, openInvoicePayUrl, payInvoiceUrl } from "@/lib/invoice-pay";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getDb, invoiceNumber, orderNumber, uid, updateDb } from "@/lib/store/local-db";
import type { CartLine, DietTag, Invoice, Order, OrderItem } from "@/lib/types";

export type DeskBillInput = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  diet_profile: DietTag;
  event_date: string;
  event_time: string;
  guest_count: number;
  delivery_or_pickup: "delivery" | "pickup";
  address: string;
  city: string;
  state: string;
  zip: string;
  items: CartLine[];
  notes: string;
  /** Full on-site setup (delivery only). */
  setup_service?: boolean;
  /** Admin percent off food subtotal (0–100). */
  discount_percent?: number;
  /** Shown on the invoice when a discount is applied. */
  discount_reason?: string;
  /**
   * Optional admin override for the delivery charge (dollars). When set, replaces
   * the distance quote so complimentary or adjusted delivery can be invoiced.
   */
  delivery_fee?: number | null;
  /** Update this saved invoice instead of creating another one. */
  order_id?: string;
  /** When false, store the invoice and do not email the guest. */
  send?: boolean;
};

function invoiceLocked(order: Order, invoice: Invoice) {
  if (order.status === "cancelled") return "This invoice is cancelled.";
  if (invoice.email_sent_at) return "This invoice was already emailed. Start a new one to bill something else.";
  const paid =
    order.status === "paid" ||
    (order.amount_paid || 0) > 0 ||
    (order.payments || []).some((row) => row.amount > 0);
  if (paid) return "This invoice already has a payment, so it can no longer be edited here.";
  return "";
}

export async function createDeskInvoice(input: DeskBillInput) {
  if (!input.items.length) throw new GuestInputError("Add at least one menu item.");
  if (!input.customer_name.trim() || !input.customer_email.trim()) {
    throw new GuestInputError("Name and email are required.");
  }
  if (!input.event_date) throw new GuestInputError("Event date is required.");

  const items: CartLine[] = input.items.map((item) => {
    const raw = item as CartLine & { unit_price?: number };
    const price = Math.max(0, parseMoneyInput(raw.price ?? raw.unit_price));
    return {
      ...item,
      name: String(item.name || "").trim().slice(0, 120),
      price,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
      unit: item.unit || "each",
      menu_item_id: item.menu_item_id || "custom",
      line_id: item.line_id || item.menu_item_id || "custom",
    };
  });
  for (const item of items) {
    if (!item.name || !(item.quantity > 0)) {
      throw new GuestInputError("Every invoice line needs a name and a quantity.");
    }
    if (item.price < 0) {
      throw new GuestInputError("Invoice line prices cannot be negative. Use $0 for complimentary items.");
    }
  }

  const db = await getDb();
  const pickup = input.delivery_or_pickup === "pickup";
  const foodSubtotal = cartSubtotal(items);
  let miles = 0;
  let deliveryFee = 0;
  const hasFeeOverride =
    input.delivery_fee != null && String(input.delivery_fee).trim() !== "";
  const feeOverride = hasFeeOverride
    ? Math.max(0, parseMoneyInput(input.delivery_fee))
    : null;
  if (!pickup) {
    const quote = await quoteDelivery({
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      subtotal: foodSubtotal,
      settings: db.settings,
    });
    const problem = deliveryProblem(quote);
    if (problem) throw new GuestInputError(problem);
    miles = quote.miles;
    deliveryFee = feeOverride != null ? feeOverride : quote.delivery_fee;
    if (feeOverride == null && !(quote.delivery_fee > 0)) {
      throw new GuestInputError(
        "Could not calculate a delivery charge for this address. Enter a delivery fee, check the address, or choose pickup."
      );
    }
  }

  const setup = !pickup && input.setup_service === true;
  const discountPercent = Math.min(100, Math.max(0, Number(input.discount_percent) || 0));
  const discountReason = String(input.discount_reason || "").trim().slice(0, 200);
  const adminDiscount = discountFromPercent(foodSubtotal, discountPercent);
  const totals = chargeTotals({
    subtotal: foodSubtotal,
    discount: adminDiscount,
    deliveryFee,
    setupFee: setupFeeFor(db.settings, setup),
    taxRate: db.settings.tax_rate,
  });

  const send = input.send !== false;
  const now = new Date().toISOString();
  const priorOrder = input.order_id
    ? db.orders.find((row) => row.id === input.order_id)
    : undefined;
  const priorInvoice = priorOrder
    ? db.invoices.find((row) => row.order_id === priorOrder.id)
    : undefined;
  if (input.order_id && (!priorOrder || !priorInvoice)) {
    throw new GuestInputError("That saved invoice could not be found.");
  }
  if (priorOrder && priorInvoice) {
    const locked = invoiceLocked(priorOrder, priorInvoice);
    if (locked) throw new GuestInputError(locked);
  }

  const orderId = priorOrder?.id || uid("ord");
  const invNum = priorInvoice?.invoice_number || invoiceNumber();
  const ordNum = priorOrder?.order_number || orderNumber();
  const existing = db.customers.find(
    (customer) => customer.email.toLowerCase() === input.customer_email.toLowerCase()
  );
  const customerId = priorOrder?.customer_id || existing?.id || uid("cust");

  const order: Order = {
    id: orderId,
    order_number: ordNum,
    customer_id: customerId,
    customer_name: input.customer_name.trim(),
    customer_email: input.customer_email.trim(),
    customer_phone: input.customer_phone.trim(),
    diet_profile: input.diet_profile,
    event_date: input.event_date,
    event_time: input.event_time || null,
    guest_count: input.guest_count,
    delivery_address: pickup ? input.address || "Pickup" : input.address,
    delivery_city: input.city,
    delivery_state: input.state || "CA",
    delivery_zip: input.zip,
    delivery_miles: miles,
    subtotal: totals.subtotal,
    delivery_fee: totals.delivery_fee,
    setup_fee: totals.setup_fee,
    discount: totals.discount,
    discount_percent: discountPercent > 0 ? discountPercent : null,
    discount_reason: discountPercent > 0 && discountReason ? discountReason : null,
    tax: totals.tax,
    total: totals.total,
    coupon_code: null,
    status: "pending",
    stripe_session_id: null,
    notes: input.notes || null,
    created_at: priorOrder?.created_at || now,
    paid_at: null,
    amount_paid: 0,
    payments: [],
  };

  // Stripe Checkout URLs expire in 24 hours — email a lasting Yogiplate pay link instead.
  let payUrl: string | null = send && stripeConfigured() ? payInvoiceUrl(orderId) : null;
  if (priorOrder?.stripe_session_id && stripeConfigured()) {
    const stripe = getStripe();
    if (stripe) {
      await stripe.checkout.sessions.expire(priorOrder.stripe_session_id).catch(() => null);
    }
  }
  order.stripe_session_id = null;

  const orderItems: OrderItem[] = items.map((item) => ({
    id: uid("oi"),
    order_id: orderId,
    menu_item_id: item.menu_item_id,
    name: item.name,
    unit_price: item.price,
    quantity: item.quantity,
    line_total: lineTotal(item.price, item.quantity),
  }));
  const html = buildInvoiceHtml(order, orderItems, db.settings, invNum, payUrl);
  const invoice: Invoice = {
    id: priorInvoice?.id || uid("inv"),
    order_id: orderId,
    invoice_number: invNum,
    html,
    pay_url: payUrl,
    email_sent_at: null,
    created_at: priorInvoice?.created_at || now,
  };

  await updateDb((next) => {
    const customer = next.customers.find((row) => row.id === customerId);
    const record = {
      id: customerId,
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address_line1: order.delivery_address,
      city: order.delivery_city,
      state: order.delivery_state,
      zip: order.delivery_zip,
      created_at: customer?.created_at || now,
      updated_at: now,
    };
    if (!customer) next.customers.push(record);
    else Object.assign(customer, record);
    const orderIndex = next.orders.findIndex((row) => row.id === orderId);
    if (orderIndex >= 0) next.orders[orderIndex] = order;
    else next.orders.unshift(order);
    next.order_items = next.order_items.filter((row) => row.order_id !== orderId);
    next.order_items.push(...orderItems);
    const invoiceIndex = next.invoices.findIndex((row) => row.order_id === orderId);
    if (invoiceIndex >= 0) next.invoices[invoiceIndex] = invoice;
    else next.invoices.push(invoice);
  });

  if (order.event_date) {
    await upsertCateringBooking({
      event_date: order.event_date,
      event_time: input.event_time || null,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      order_id: order.id,
      draft: {
        event_date: order.event_date,
        event_time: input.event_time,
        diet: order.diet_profile,
        adults: order.guest_count,
        kids: null,
        city: order.delivery_city,
        address: order.delivery_address,
        notes: order.notes || "",
        delivery_or_pickup: input.delivery_or_pickup,
        occasion: "",
        meal: "",
        budget: "",
        setup_needs: order.setup_fee ? setupNeedsLabel(order.setup_fee) : "",
        special_requirements: "",
        package_tier: "",
        confirmed: false,
      },
      items_summary: orderItems.map((item) => `${item.quantity}× ${item.name}`).join("; "),
      food_subtotal: order.subtotal,
      order_number: order.order_number,
      invoice_number: invNum,
      amount_due: order.total,
      status: send ? "invoice_sent" : "order_placed",
    }).catch(() => null);
  }

  if (!send) {
    return {
      order_id: orderId,
      order_number: ordNum,
      invoice_number: invNum,
      pay_url: null,
      email_sent: false,
      saved: true,
    };
  }

  const subject = `Yogiplate Invoice ${invNum} — Order ${ordNum}`;
  let email = await sendInvoiceEmail({
    to: order.customer_email,
    subject,
    html,
  });
  if (!email.sent && smtpConfigured()) {
    try {
      await sendGuestQuoteSmtp({
        to: order.customer_email,
        name: order.customer_name,
        subject,
        html,
        text: payUrl
          ? `Invoice ${invNum} for order ${ordNum}. Total ${order.total}. Pay: ${payUrl}`
          : `Invoice ${invNum} for order ${ordNum}. Total ${order.total}. We'll send a pay link shortly.`,
      });
      email = { sent: true };
    } catch (err) {
      email = {
        sent: false,
        reason: err instanceof Error ? err.message : "smtp_failed",
      };
    }
  }
  if (email.sent) {
    await updateDb((next) => {
      const inv = next.invoices.find((row) => row.id === invoice.id);
      if (inv) inv.email_sent_at = new Date().toISOString();
    });
  }

  return {
    order_id: orderId,
    order_number: ordNum,
    invoice_number: invNum,
    pay_url: payUrl,
    email_sent: email.sent,
    email_reason: email.sent ? undefined : email.reason,
    saved: true,
  };
}

export async function listUnsentDeskInvoices() {
  const db = await getDb();
  return db.invoices
    .filter((invoice) => !invoice.email_sent_at)
    .map((invoice) => {
      const order = db.orders.find((row) => row.id === invoice.order_id);
      if (!order || order.status === "cancelled" || order.status === "paid") return null;
      if ((order.amount_paid || 0) > 0) return null;
      return {
        order_id: order.id,
        invoice_number: invoice.invoice_number,
        order_number: order.order_number,
        customer_name: order.customer_name,
        event_date: order.event_date,
        total: order.total,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
}

export async function getDeskInvoiceDraft(orderId: string) {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  const invoice = db.invoices.find((row) => row.order_id === orderId);
  if (!order || !invoice) throw new GuestInputError("That saved invoice could not be found.");
  const locked = invoiceLocked(order, invoice);
  if (locked) throw new GuestInputError(locked);
  const booking = (db.catering_bookings || []).find((row) => row.order_id === order.id);
  const pickup =
    booking?.delivery_or_pickup === "pickup" ||
    (order.delivery_fee <= 0 && order.delivery_miles <= 0);
  const items = db.order_items
    .filter((row) => row.order_id === order.id)
    .map((row) => ({
      line_id: row.id,
      menu_item_id: row.menu_item_id,
      name: row.name,
      price: row.unit_price,
      quantity: row.quantity,
      unit: row.menu_item_id === "custom" ? "each" : "tray",
    }));
  return {
    order_id: order.id,
    invoice_number: invoice.invoice_number,
    order_number: order.order_number,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    diet_profile: order.diet_profile,
    event_date: order.event_date,
    event_time: order.event_time || booking?.event_time || "",
    guest_count: order.guest_count,
    delivery_or_pickup: pickup ? "pickup" : "delivery",
    address: pickup && order.delivery_address === "Pickup" ? "" : order.delivery_address,
    city: order.delivery_city,
    zip: order.delivery_zip,
    notes: order.notes || "",
    setup_service: (order.setup_fee || 0) > 0,
    discount_percent: order.discount_percent || 0,
    discount_reason: order.discount_reason || "",
    delivery_fee: order.delivery_fee,
    delivery_miles: order.delivery_miles,
    items,
  };
}

/** Point a saved invoice at a lasting pay URL (Stripe session is created when the guest clicks). */
export async function ensureInvoicePayLink(orderId: string) {
  return ensureFreshInvoicePayLink(orderId);
}

export async function markDeskInvoicePaid(
  orderId: string,
  stripeSessionId: string,
  amount?: number | null
) {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  if (!order || order.status === "cancelled") return;
  const paidNow = amount != null && amount > 0 ? amount : order.total;
  const invoice = db.invoices.find((row) => row.order_id === orderId);
  const items = db.order_items.filter((row) => row.order_id === orderId);
  const payments = appendPaymentRecord(order.payments, {
    amount: paidNow,
    stripe_session_id: stripeSessionId,
    note: "Payment",
  });
  const amountPaid = fromCents(payments.reduce((sum, row) => sum + toCents(row.amount), 0));
  const fullyPaid = isPaidInFull(amountPaid, order.total);
  const paidLabel = fullyPaid
    ? "Paid in full"
    : `Partial payment ${formatMoney(amountPaid)} of ${formatMoney(order.total)}${
        payments.length > 1 ? ` · ${payments.length} payments` : ""
      }`;
  if (invoice) {
    const payUrl = openInvoicePayUrl(orderId, fullyPaid);
    const html = buildInvoiceHtml(
      { ...order, amount_paid: amountPaid, payments, status: fullyPaid ? "paid" : order.status },
      items,
      db.settings,
      invoice.invoice_number,
      payUrl,
      { paidLabel }
    );
    await updateDb((next) => {
      const row = next.orders.find((item) => item.id === orderId);
      if (row) {
        row.payments = appendPaymentRecord(row.payments, {
          amount: paidNow,
          stripe_session_id: stripeSessionId,
          note: fullyPaid ? "Paid in full" : "Partial payment",
        });
        row.amount_paid = fromCents(
          (row.payments || []).reduce((sum, item) => sum + toCents(item.amount), 0)
        );
        row.stripe_session_id = stripeSessionId || row.stripe_session_id;
        if (isPaidInFull(row.amount_paid, row.total)) {
          row.status = "paid";
          row.paid_at = row.paid_at || new Date().toISOString();
        }
      }
      const inv = next.invoices.find((rowItem) => rowItem.id === invoice.id);
      if (inv) {
        inv.pay_url = payUrl;
        inv.html = html;
      }
    });
  }
  if (order.event_date) {
    await upsertCateringBooking({
      event_date: order.event_date,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      order_id: order.id,
      order_number: order.order_number,
      invoice_number: invoice?.invoice_number,
      amount_due: order.total,
      items_summary: items.map((item) => `${item.quantity}× ${item.name}`).join("; "),
      food_subtotal: order.subtotal,
      payment: {
        amount: paidNow,
        stripe_session_id: stripeSessionId,
        note: fullyPaid ? "Paid in full" : "Partial payment",
      },
    }).catch(() => null);
  }
  await emailPaymentReceived(orderId, fullyPaid ? undefined : { depositAmount: paidNow });
}
