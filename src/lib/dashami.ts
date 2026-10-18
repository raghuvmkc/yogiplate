import { upsertCateringBooking } from "@/lib/calendar-bookings";
import {
  DASHAMI_EVENT_DATE,
  DASHAMI_EVENT_TIME,
  DASHAMI_MAX_MILES,
  DASHAMI_PATH,
  DASHAMI_PRICE,
  dashamiOrdersOpen,
} from "@/lib/dashami-offer";
import { quoteDelivery } from "@/lib/delivery";
import { GuestInputError } from "@/lib/guest-error";
import { createCateringPaymentLink } from "@/lib/stripe-checkout";
import { siteUrl } from "@/lib/site";
import { getDb, invoiceNumber, orderNumber, uid } from "@/lib/store/local-db";
import { savePending } from "@/lib/store/pending";
import type { CartLine } from "@/lib/types";

export function dashamiLunchItems(bread: "puri" | "chapati"): CartLine[] {
  const breadName = bread === "chapati" ? "Chapati" : "Puri";
  return [
    {
      menu_item_id: "dashami-lunch",
      line_id: "dashami-lunch",
      name: `Vijaya Dashami family lunch (${breadName})`,
      price: DASHAMI_PRICE,
      quantity: 1,
      unit: "family",
    },
  ];
}

type Quote = Awaited<ReturnType<typeof quoteDelivery>>;

export function dashamiDistanceProblem(quote: Quote) {
  if (quote.address_error) return quote.address_error;
  if (!quote.address_verified) {
    return "We could not confirm that street. Please check the address and try again.";
  }
  if (quote.miles > DASHAMI_MAX_MILES) {
    return `This address is ${quote.miles} miles from our kitchen. For this lunch we are not accepting orders beyond ${DASHAMI_MAX_MILES} miles.`;
  }
  return null;
}

export async function startDashamiCheckout(input: {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address: string;
  city: string;
  zip: string;
  bread: "puri" | "chapati";
}) {
  if (!dashamiOrdersOpen()) {
    throw new GuestInputError(
      "Pre-orders for this lunch closed Monday, October 19 at 8:00 PM Pacific."
    );
  }
  const name = input.customer_name.trim();
  const email = input.customer_email.trim();
  const phone = input.customer_phone.trim();
  const address = input.address.trim();
  const city = input.city.trim();
  const zip = input.zip.trim();
  if (name.length < 2) throw new GuestInputError("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GuestInputError("Enter an email so we can send your receipt.");
  }
  if (phone.replace(/\D/g, "").length < 10) {
    throw new GuestInputError("Enter a phone number with at least 10 digits.");
  }
  if (address.length < 5 || city.length < 2 || !/^\d{5}$/.test(zip)) {
    throw new GuestInputError("Enter the street, city, and a 5-digit ZIP.");
  }

  const db = await getDb();
  const quote = await quoteDelivery({
    address,
    city,
    state: "CA",
    zip,
    subtotal: DASHAMI_PRICE,
    settings: db.settings,
  });
  const problem = dashamiDistanceProblem(quote);
  if (problem) throw new GuestInputError(problem);

  const bread = input.bread === "chapati" ? "chapati" : "puri";
  const items = dashamiLunchItems(bread);
  const orderId = uid("ord");
  const ordNum = orderNumber();
  const invNum = invoiceNumber();
  const notes = [
    "Vijaya Dashami family lunch for 2 adults and 2 kids.",
    `Bread: ${bread === "chapati" ? "Chapati" : "Puri"}.`,
    "Free home delivery. Cooked the same day by Chef Radhavallabh.",
    "Menu: pineapple halwah, palak paneer, alu matar gobi, peas pulao, bindi cabbage sabji, kadi pakora.",
  ].join(" ");

  await upsertCateringBooking({
    event_date: DASHAMI_EVENT_DATE,
    event_time: DASHAMI_EVENT_TIME,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    order_id: orderId,
    order_number: ordNum,
    invoice_number: invNum,
    amount_due: DASHAMI_PRICE,
    food_subtotal: DASHAMI_PRICE,
    items_summary: items.map((item) => `${item.quantity}× ${item.name}`).join("; "),
    status: "order_placed",
    draft: {
      event_date: DASHAMI_EVENT_DATE,
      event_time: DASHAMI_EVENT_TIME,
      diet: "pure_vegetarian",
      adults: 2,
      kids: 2,
      city,
      address,
      notes,
      delivery_or_pickup: "delivery",
      occasion: "Vijaya Dashami",
      meal: "lunch",
      budget: "",
      setup_needs: "",
      special_requirements: "No onion, no garlic.",
      package_tier: "Family lunch",
      confirmed: false,
    },
  });

  const pendingId = uid("pending");
  await savePending({
    id: pendingId,
    order_id: orderId,
    order_number: ordNum,
    invoice_number: invNum,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    diet_profile: "pure_vegetarian",
    event_date: DASHAMI_EVENT_DATE,
    event_time: DASHAMI_EVENT_TIME,
    guest_count: 4,
    delivery_address: address,
    delivery_city: city,
    delivery_state: "CA",
    delivery_zip: zip,
    delivery_miles: quote.miles,
    items,
    coupon_code: null,
    notes,
    setup_service: false,
    locked_total: DASHAMI_PRICE,
    created_at: new Date().toISOString(),
  });

  const site = siteUrl();
  const session = await createCateringPaymentLink({
    customer_email: email,
    amount: DASHAMI_PRICE,
    product_name: `Yogiplate Vijaya Dashami family lunch — ${ordNum}`,
    description: items[0]?.name || "Vijaya Dashami family lunch",
    success_url: `${site}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}${DASHAMI_PATH}`,
    order_id: orderId,
    order_number: ordNum,
    invoice_number: invNum,
    kind: "checkout",
    extra: { pending_id: pendingId },
  });

  return { url: session.url, order_number: ordNum };
}
