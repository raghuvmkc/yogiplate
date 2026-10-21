/**
 * Calendar booking identity rules (two same-day guest orders must not merge).
 * Run: npx tsx src/lib/calendar-bookings.test.ts
 */
import assert from "node:assert/strict";

function matchKey(
  b: {
    order_id?: string | null;
    quote_id?: string | null;
    chat_session_id?: string | null;
    event_date: string;
    customer_email: string;
    status: string;
  },
  input: {
    order_id?: string | null;
    quote_id?: string | null;
    chat_session_id?: string | null;
    event_date: string;
    customer_email: string;
  }
) {
  if (input.order_id && b.order_id === input.order_id) return true;
  if (input.quote_id && b.quote_id === input.quote_id) return true;
  if (input.order_id && b.order_id && b.order_id !== input.order_id) return false;
  if (input.quote_id && b.quote_id && b.quote_id !== input.quote_id) return false;
  if (b.status === "cancelled") return false;
  if (
    input.chat_session_id &&
    b.chat_session_id === input.chat_session_id &&
    b.event_date === input.event_date &&
    !b.order_id
  ) {
    return true;
  }
  const email = (input.customer_email || "").toLowerCase().trim();
  if (
    email &&
    (b.customer_email || "").toLowerCase() === email &&
    b.event_date === input.event_date &&
    !b.order_id
  ) {
    if (b.quote_id && input.quote_id && b.quote_id !== input.quote_id) return false;
    if (b.quote_id && !input.quote_id) return false;
    return true;
  }
  return false;
}

const day = "2026-10-20";
const email = "moumita@example.com";

assert.equal(
  matchKey(
    { order_id: "ord_1", event_date: day, customer_email: email, status: "paid" },
    { order_id: "ord_2", event_date: day, customer_email: email }
  ),
  false,
  "two same-day orders for one guest must stay separate"
);

assert.equal(
  matchKey(
    { order_id: "ord_1", event_date: day, customer_email: email, status: "partial" },
    { order_id: "ord_1", event_date: day, customer_email: email }
  ),
  true,
  "same order updates in place"
);

assert.equal(
  matchKey(
    {
      order_id: null,
      event_date: day,
      customer_email: email,
      status: "unconfirmed",
    },
    { order_id: "ord_1", event_date: day, customer_email: email }
  ),
  true,
  "first order may attach to an open inquiry"
);

console.log("calendar-bookings.test.ts: ok");
