import {
  appendPaymentRecord,
  upsertCateringBooking,
} from "@/lib/calendar-bookings";
import { quoteDelivery } from "@/lib/delivery";
import { buildInvoiceHtml, emailPaymentReceived, sendInvoiceEmail } from "@/lib/invoice";
import {
  calcOrderTotals,
  cartSubtotal,
  chargeTotals,
  formatMoney,
  fromCents,
  isPaidInFull,
  lineTotal,
  toCents,
} from "@/lib/pricing";
import { sendGuestQuoteSmtp, smtpConfigured } from "@/lib/smtp";
import { stripeConfigured } from "@/lib/stripe";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import { siteUrl } from "@/lib/site";
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
};

export async function createDeskInvoice(input: DeskBillInput) {
  if (!input.items.length) throw new Error("Add at least one menu item.");
  if (!input.customer_name.trim() || !input.customer_email.trim()) {
    throw new Error("Name and email are required.");
  }
  if (!input.event_date) throw new Error("Event date is required.");
  if (!stripeConfigured()) {
    throw new Error("Stripe is not configured, so a pay link cannot be sent.");
  }

  const db = await getDb();
  const pickup = input.delivery_or_pickup === "pickup";
  let miles = 0;
  if (!pickup) {
    const quote = await quoteDelivery({
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      subtotal: cartSubtotal(input.items),
      settings: db.settings,
    });
    if (!quote.in_service) {
      throw new Error(
        `Outside the service area (${quote.miles} mi). Delivery is within ${db.settings.service_radius_miles} miles.`
      );
    }
    miles = quote.miles;
  }

  const totals = calcOrderTotals({
    items: input.items,
    miles,
    coupon: null,
    settings: db.settings,
  });
  if (pickup) {
    Object.assign(
      totals,
      chargeTotals({
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: 0,
        taxRate: db.settings.tax_rate,
      })
    );
  }

  const now = new Date().toISOString();
  const orderId = uid("ord");
  const invNum = invoiceNumber();
  const ordNum = orderNumber();
  const existing = db.customers.find(
    (customer) => customer.email.toLowerCase() === input.customer_email.toLowerCase()
  );
  const customerId = existing?.id || uid("cust");

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
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    coupon_code: null,
    status: "pending",
    stripe_session_id: null,
    notes: input.notes || null,
    created_at: now,
    paid_at: null,
  };

  const session = await createCateringPaymentLink({
    customer_email: order.customer_email,
    amount: order.total,
    product_name: `Yogiplate invoice ${invNum}`,
    description: `Order ${ordNum}. ${input.items
      .map((item) => `${item.name} × ${item.quantity}`)
      .join(", ")}`,
    success_url: `${siteUrl()}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: siteUrl(),
    order_id: orderId,
    order_number: ordNum,
    invoice_number: invNum,
    kind: "desk_invoice",
  });
  order.stripe_session_id = session.id;
  const payUrl = session.url;
  if (!payUrl) throw new Error("Stripe did not return a pay link.");

  const orderItems: OrderItem[] = input.items.map((item) => ({
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
    id: uid("inv"),
    order_id: orderId,
    invoice_number: invNum,
    html,
    pay_url: payUrl,
    email_sent_at: null,
    created_at: now,
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
    next.orders.unshift(order);
    next.order_items.push(...orderItems);
    next.invoices.push(invoice);
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
        setup_needs: "",
        special_requirements: "",
        package_tier: "",
        confirmed: false,
      },
      items_summary: orderItems.map((item) => `${item.quantity}× ${item.name}`).join("; "),
      food_subtotal: order.subtotal,
      order_number: order.order_number,
      invoice_number: invNum,
      amount_due: order.total,
      status: "invoice_sent",
    }).catch(() => null);
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
        text: `Invoice ${invNum} for order ${ordNum}. Total ${order.total}. Pay: ${payUrl}`,
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
    order_number: ordNum,
    invoice_number: invNum,
    pay_url: payUrl,
    email_sent: email.sent,
    email_reason: email.sent ? undefined : email.reason,
  };
}

export async function markDeskInvoicePaid(
  orderId: string,
  stripeSessionId: string,
  amount?: number | null
) {
  const db = await getDb();
  const order = db.orders.find((row) => row.id === orderId);
  if (!order) return;
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
    const html = buildInvoiceHtml(
      { ...order, amount_paid: amountPaid, payments, status: fullyPaid ? "paid" : order.status },
      items,
      db.settings,
      invoice.invoice_number,
      null,
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
      if (inv) inv.html = html;
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
