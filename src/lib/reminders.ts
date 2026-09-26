import { sendInvoiceEmail } from "@/lib/invoice";
import { publicQuoteUrl } from "@/lib/site";
import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { Quote, Reminder, ReminderKind } from "@/lib/types";

function noonBeforeEvent(eventDate: string): string {
  // Event date is YYYY-MM-DD in kitchen timezone; schedule ~17:00 PT day before as ISO.
  const [y, m, d] = eventDate.split("-").map(Number);
  const due = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  // 17:00 America/Los_Angeles ≈ 00:00 UTC next day in winter; use fixed 00:00 UTC of day-before for simplicity
  return due.toISOString();
}

function hoursFromNowIso(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function insertReminder(reminder: Reminder) {
  await updateDb((d) => {
    d.reminders = d.reminders || [];
    // Avoid duplicates of same kind+quote
    const exists = d.reminders.some(
      (r) =>
        r.quote_id === reminder.quote_id &&
        r.kind === reminder.kind &&
        r.status === "pending"
    );
    if (!exists) d.reminders.push(reminder);
  });
}

export async function scheduleQuoteReminders(quoteId: string) {
  const db = await getDb();
  const quote = (db.quotes || []).find((q) => q.id === quoteId);
  if (!quote) return;

  const now = new Date().toISOString();
  const url = publicQuoteUrl(quote);

  // Follow-up if deposit not paid — 48h after quote
  await insertReminder({
    id: uid("rem"),
    kind: "quote_followup",
    status: "pending",
    due_at: hoursFromNowIso(48),
    to_email: quote.customer_email,
    to_name: quote.customer_name,
    subject: `Reminder: your Yogiplate quote ${quote.quote_number}`,
    body_html: `<p>Hi ${quote.customer_name},</p>
<p>Just checking in on your catering quote <strong>${quote.quote_number}</strong>
for ${quote.event_date || "your event"}.</p>
<p><a href="${url}">View quote &amp; pay deposit</a></p>
<p>— Yogiplate</p>`,
    quote_id: quote.id,
    event_date: quote.event_date || null,
    created_at: now,
  });

  if (quote.event_date) {
    await insertReminder({
      id: uid("rem"),
      kind: "day_before_event",
      status: "pending",
      due_at: noonBeforeEvent(quote.event_date),
      to_email: quote.customer_email,
      to_name: quote.customer_name,
      subject: `Tomorrow: Yogiplate catering for ${quote.event_date}`,
      body_html: dayBeforeHtml(quote, url),
      quote_id: quote.id,
      event_date: quote.event_date,
      created_at: now,
    });

    // Post-event review ask — day after event at noon UTC
    const [y, m, d] = quote.event_date.split("-").map(Number);
    const after = new Date(Date.UTC(y, m - 1, d + 1, 19, 0, 0));
    await insertReminder({
      id: uid("rem"),
      kind: "post_event_review",
      status: "pending",
      due_at: after.toISOString(),
      to_email: quote.customer_email,
      to_name: quote.customer_name,
      subject: "How was your Yogiplate catering?",
      body_html: `<p>Hi ${quote.customer_name},</p>
<p>We hope your event was wonderful. If you have a moment, reply to this email with any feedback — it helps us cook even better for the Bay Area.</p>
<p>With gratitude,<br/>Yogiplate · Chef Radhavallabh</p>`,
      quote_id: quote.id,
      event_date: quote.event_date,
      created_at: now,
    });
  }
}

function dayBeforeHtml(quote: Quote, url: string) {
  return `<p>Hi ${quote.customer_name},</p>
<p>This is a friendly reminder that your Yogiplate catering is scheduled for <strong>${quote.event_date}</strong>${
    quote.event_time ? ` at ${quote.event_time}` : ""
  }.</p>
<p>Guests: ${quote.guest_count || "TBD"} · Diet: ${quote.diet_profile}</p>
<p>Quote: <a href="${url}">${quote.quote_number}</a></p>
<p>If anything changed, reply or WhatsApp us as soon as you can.</p>
<p>— Yogiplate kitchen</p>`;
}

export async function scheduleOrderDayBefore(input: {
  orderId: string;
  email: string;
  name: string;
  eventDate: string;
  orderNumber: string;
}) {
  if (!input.eventDate) return;
  const now = new Date().toISOString();
  await insertReminder({
    id: uid("rem"),
    kind: "day_before_event",
    status: "pending",
    due_at: noonBeforeEvent(input.eventDate),
    to_email: input.email,
    to_name: input.name,
    subject: `Tomorrow: Yogiplate order ${input.orderNumber}`,
    body_html: `<p>Hi ${input.name},</p>
<p>Your Yogiplate order <strong>${input.orderNumber}</strong> is scheduled for <strong>${input.eventDate}</strong>.</p>
<p>We look forward to serving you.</p>
<p>— Yogiplate kitchen</p>`,
    order_id: input.orderId,
    event_date: input.eventDate,
    created_at: now,
  });
}

export async function processDueReminders(limit = 25) {
  const db = await getDb();
  const now = Date.now();
  const due = (db.reminders || [])
    .filter((r) => r.status === "pending" && new Date(r.due_at).getTime() <= now)
    .slice(0, limit);

  const results: { id: string; kind: ReminderKind; sent: boolean; reason?: string }[] =
    [];

  for (const rem of due) {
    // Skip quote follow-up if deposit already paid
    if (rem.kind === "quote_followup" && rem.quote_id) {
      const q = (db.quotes || []).find((x) => x.id === rem.quote_id);
      if (q && (q.status === "deposit_paid" || q.status === "accepted")) {
        await updateDb((d) => {
          const r = (d.reminders || []).find((x) => x.id === rem.id);
          if (r) r.status = "cancelled";
        });
        results.push({ id: rem.id, kind: rem.kind, sent: false, reason: "cancelled_paid" });
        continue;
      }
    }

    try {
      const send = await sendInvoiceEmail({
        to: rem.to_email,
        subject: rem.subject,
        html: rem.body_html,
      });
      await updateDb((d) => {
        const r = (d.reminders || []).find((x) => x.id === rem.id);
        if (!r) return;
        if (send.sent) {
          r.status = "sent";
          r.sent_at = new Date().toISOString();
        } else {
          r.status = "failed";
          r.error = send.reason || "send_failed";
        }
      });
      results.push({
        id: rem.id,
        kind: rem.kind,
        sent: send.sent,
        reason: send.sent ? undefined : send.reason,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateDb((d) => {
        const r = (d.reminders || []).find((x) => x.id === rem.id);
        if (r) {
          r.status = "failed";
          r.error = msg.slice(0, 200);
        }
      });
      results.push({ id: rem.id, kind: rem.kind, sent: false, reason: msg });
    }
  }

  return { processed: results.length, results };
}

export async function listReminders() {
  const db = await getDb();
  return [...(db.reminders || [])].sort((a, b) =>
    a.due_at.localeCompare(b.due_at)
  );
}
