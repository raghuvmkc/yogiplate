import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { setupFeeFor, setupNeedsLabel } from "@/lib/pricing";
import { createQuote } from "@/lib/quotes";
import { getDb } from "@/lib/store/local-db";
import type { CartProposalLine } from "@/lib/chat/order-draft";
import type { DietTag } from "@/lib/types";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const items = (body.items || []) as CartProposalLine[];
    if (!String(body.customer_name || "").trim() || !String(body.customer_email || "").trim()) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one menu item." }, { status: 400 });
    }
    const guests = Number(body.guest_count) || 0;
    const setup =
      body.setup_service === true && body.delivery_or_pickup !== "pickup"
        ? setupNeedsLabel(setupFeeFor((await getDb()).settings, true))
        : "";
    const { quote, email } = await createQuote({
      lead: {
        name: String(body.customer_name || "").trim(),
        email: String(body.customer_email || "").trim(),
        phone: String(body.customer_phone || "").trim(),
      },
      channel: "phone",
      send_email: true,
      draft: {
        occasion: "",
        event_date: String(body.event_date || ""),
        event_time: String(body.event_time || ""),
        adults: guests || null,
        kids: null,
        diet: (body.diet_profile || "pure_vegetarian") as DietTag,
        delivery_or_pickup: body.delivery_or_pickup === "pickup" ? "pickup" : "delivery",
        city: String(body.city || ""),
        address: String(body.address || ""),
        budget: "",
        setup_needs: setup,
        special_requirements: String(body.notes || ""),
        meal: "",
        package_tier: "",
        confirmed: false,
        notes: String(body.notes || ""),
      },
      proposal: {
        diet: body.diet_profile || "pure_vegetarian",
        guest_count: guests,
        event_date: String(body.event_date || ""),
        notes: String(body.notes || ""),
        replace: true,
        items,
        summary: items.map((item) => `${item.quantity}× ${item.name}`).join(", "),
        source: "plan",
      },
    });
    return NextResponse.json({
      quote_number: quote.quote_number,
      email_sent: email.sent,
      email_reason: email.sent ? undefined : email.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the quote.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
