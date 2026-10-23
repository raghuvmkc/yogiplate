/**
 * Caller ↔ calendar phone matching.
 * Run: npx tsx src/lib/caller-calendar.test.ts
 */
import assert from "node:assert/strict";
import {
  eventDateToYyMmDd,
  formatCalendarCallerLabel,
  phoneMatchKey,
} from "@/lib/caller-calendar";

assert.equal(phoneMatchKey("+14085551212"), "4085551212");
assert.equal(phoneMatchKey("(408) 555-1212"), "4085551212");
assert.equal(phoneMatchKey("14085551212"), "4085551212");
assert.equal(eventDateToYyMmDd("2026-10-22"), "261022");
assert.equal(
  formatCalendarCallerLabel({
    name: "Moumita",
    event_date: "2026-10-22",
    event_yymmdd: "261022",
    booking_id: "cbk_1",
    phone: "+14085551212",
  }),
  "Moumita · 261022"
);

console.log("caller-calendar.test.ts: ok");
