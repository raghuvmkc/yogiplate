import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { createDeskInvoice } from "@/lib/desk-invoice";
import type { CartLine, DietTag } from "@/lib/types";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const items = (body.items || []) as CartLine[];
    const result = await createDeskInvoice({
      customer_name: String(body.customer_name || ""),
      customer_email: String(body.customer_email || ""),
      customer_phone: String(body.customer_phone || ""),
      diet_profile: (body.diet_profile || "pure_vegetarian") as DietTag,
      event_date: String(body.event_date || ""),
      event_time: String(body.event_time || ""),
      guest_count: Number(body.guest_count) || 0,
      delivery_or_pickup: body.delivery_or_pickup === "pickup" ? "pickup" : "delivery",
      address: String(body.address || ""),
      city: String(body.city || ""),
      state: String(body.state || "CA"),
      zip: String(body.zip || ""),
      items,
      notes: String(body.notes || ""),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the invoice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
