import { NextResponse } from "next/server";
import { createDeskInvoice } from "@/lib/desk-invoice";
import { repriceCart } from "@/lib/reprice-cart";
import { getDb } from "@/lib/store/local-db";
import type { CartLine, DietTag } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > MAX_PER_WINDOW;
}

/** Guest asks for an emailed invoice with a Stripe pay link instead of paying now. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "local";
  if (rateLimited(ip.split(",")[0]!.trim())) {
    return NextResponse.json(
      { error: "Too many invoice requests. Please wait a few minutes." },
      { status: 429 }
    );
  }
  try {
    const body = await req.json();
    const email = String(body.customer_email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (String(body.customer_name || "").trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }
    if (String(body.customer_phone || "").replace(/\D/g, "").length < 10) {
      return NextResponse.json(
        { error: "Please enter a phone number so we can reach you about the event." },
        { status: 400 }
      );
    }
    const pickup = body.delivery_or_pickup === "pickup";
    if (!pickup && (!body.address || !body.city || !body.zip)) {
      return NextResponse.json(
        { error: "Please enter the delivery address, city, and ZIP, or choose pickup." },
        { status: 400 }
      );
    }

    const db = await getDb();
    const items = repriceCart(db, (body.items || []) as CartLine[]);
    const result = await createDeskInvoice({
      customer_name: String(body.customer_name).trim(),
      customer_email: email,
      customer_phone: String(body.customer_phone || "").trim(),
      diet_profile: (body.diet_profile || "pure_vegetarian") as DietTag,
      event_date: String(body.event_date || ""),
      event_time: /^\d{2}:\d{2}$/.test(String(body.event_time || "")) ? String(body.event_time) : "",
      guest_count: Number(body.guest_count) || 0,
      delivery_or_pickup: pickup ? "pickup" : "delivery",
      address: String(body.address || ""),
      city: String(body.city || ""),
      state: String(body.state || "CA"),
      zip: String(body.zip || ""),
      items,
      notes: String(body.notes || ""),
    });
    if (!result.email_sent) {
      console.error("[email-invoice] email not sent:", result.email_reason);
    }
    return NextResponse.json({
      order_number: result.order_number,
      invoice_number: result.invoice_number,
      email_sent: result.email_sent,
      pay_url: result.pay_url,
    });
  } catch (err) {
    console.error("[email-invoice]", err);
    const message = err instanceof Error ? err.message : "Could not send the invoice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
