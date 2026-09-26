import { buildInvoiceHtml, sendInvoiceEmail } from "@/lib/invoice";
import { calcOrderTotals } from "@/lib/pricing";
import {
  getDb,
  invoiceNumber,
  orderNumber,
  uid,
  updateDb,
} from "@/lib/store/local-db";
import { createServiceSupabase } from "@/lib/supabase/server";
import type {
  CartLine,
  Coupon,
  DietTag,
  Invoice,
  Order,
  OrderItem,
} from "@/lib/types";

export async function findCoupon(code: string): Promise<Coupon | null> {
  const supabase = createServiceSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("coupons")
      .select("*")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();
    if (data) {
      const coupon = data as Coupon;
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return null;
      if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return null;
      return coupon;
    }
  }
  const db = await getDb();
  const coupon = db.coupons.find(
    (c) => c.code.toUpperCase() === code.toUpperCase() && c.is_active
  );
  if (!coupon) return null;
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return null;
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return null;
  return coupon;
}

async function syncFulfilledToSupabase(input: {
  order: Order;
  orderItems: OrderItem[];
  invoice: Invoice;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    address_line1: string;
    city: string;
    state: string;
    zip: string;
    created_at: string;
    updated_at: string;
  };
}) {
  const supabase = createServiceSupabase();
  if (!supabase) return;

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("email", input.customer.email)
    .maybeSingle();

  let customerUuid = existing?.id as string | undefined;
  if (!customerUuid) {
    const { data: created } = await supabase
      .from("customers")
      .insert({
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
        address_line1: input.customer.address_line1,
        city: input.customer.city,
        state: input.customer.state,
        zip: input.customer.zip,
      })
      .select("id")
      .single();
    customerUuid = created?.id;
  } else {
    await supabase
      .from("customers")
      .update({
        name: input.customer.name,
        phone: input.customer.phone,
        address_line1: input.customer.address_line1,
        city: input.customer.city,
        state: input.customer.state,
        zip: input.customer.zip,
        updated_at: input.customer.updated_at,
      })
      .eq("id", customerUuid);
  }

  await supabase.from("orders").upsert({
    ...input.order,
    customer_id: customerUuid || null,
  });
  await supabase.from("order_items").upsert(input.orderItems);
  await supabase.from("invoices").upsert(input.invoice);
  if (input.order.coupon_code) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id, used_count")
      .eq("code", input.order.coupon_code)
      .maybeSingle();
    if (coupon) {
      await supabase
        .from("coupons")
        .update({ used_count: (coupon.used_count || 0) + 1 })
        .eq("id", coupon.id);
    }
  }
}

export async function fulfillPaidOrder(input: {
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
  stripe_session_id: string | null;
}) {
  const db = await getDb();
  const coupon = input.coupon_code
    ? await findCoupon(input.coupon_code)
    : null;
  const totals = calcOrderTotals({
    items: input.items,
    miles: input.delivery_miles,
    coupon,
    settings: db.settings,
  });

  const now = new Date().toISOString();
  const orderId = uid("ord");
  const invNum = invoiceNumber();
  const ordNum = orderNumber();

  let customer = db.customers.find(
    (c) => c.email.toLowerCase() === input.customer_email.toLowerCase()
  );
  const customerId = customer?.id || uid("cust");

  const order: Order = {
    id: orderId,
    order_number: ordNum,
    customer_id: customerId,
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    customer_phone: input.customer_phone,
    diet_profile: input.diet_profile,
    event_date: input.event_date,
    guest_count: input.guest_count,
    delivery_address: input.delivery_address,
    delivery_city: input.delivery_city,
    delivery_state: input.delivery_state,
    delivery_zip: input.delivery_zip,
    delivery_miles: input.delivery_miles,
    subtotal: totals.subtotal,
    delivery_fee: totals.delivery_fee,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    coupon_code: coupon?.code || null,
    status: "paid",
    stripe_session_id: input.stripe_session_id,
    notes: input.notes,
    created_at: now,
    paid_at: now,
  };

  const orderItems: OrderItem[] = input.items.map((i) => ({
    id: uid("oi"),
    order_id: orderId,
    menu_item_id: i.menu_item_id,
    name: i.name,
    unit_price: i.price,
    quantity: i.quantity,
    line_total: Math.round(i.price * i.quantity * 100) / 100,
  }));

  const html = buildInvoiceHtml(order, orderItems, db.settings, invNum);
  const invoice: Invoice = {
    id: uid("inv"),
    order_id: orderId,
    invoice_number: invNum,
    html,
    email_sent_at: null,
    created_at: now,
  };

  const customerRecord = {
    id: customerId,
    name: input.customer_name,
    email: input.customer_email,
    phone: input.customer_phone,
    address_line1: input.delivery_address,
    city: input.delivery_city,
    state: input.delivery_state,
    zip: input.delivery_zip,
    created_at: customer?.created_at || now,
    updated_at: now,
  };

  await updateDb((d) => {
    if (!customer) {
      d.customers.push(customerRecord);
    } else {
      const idx = d.customers.findIndex((c) => c.id === customerId);
      d.customers[idx] = { ...d.customers[idx], ...customerRecord };
    }
    d.orders.unshift(order);
    d.order_items.push(...orderItems);
    if (coupon) {
      const cIdx = d.coupons.findIndex((c) => c.id === coupon.id);
      if (cIdx >= 0) d.coupons[cIdx].used_count += 1;
    }
    d.invoices.push(invoice);
  });

  try {
    await syncFulfilledToSupabase({
      order,
      orderItems,
      invoice,
      customer: customerRecord,
    });
  } catch (err) {
    console.error("[supabase] sync failed", err);
  }

  const emailResult = await sendInvoiceEmail({
    to: input.customer_email,
    subject: `Yogiplate Invoice ${invNum} — Order ${ordNum}`,
    html,
  });

  if (emailResult.sent) {
    await updateDb((d) => {
      const inv = d.invoices.find((i) => i.order_id === orderId);
      if (inv) inv.email_sent_at = new Date().toISOString();
    });
  }

  return { order, invoice_number: invNum, email_sent: emailResult.sent };
}
