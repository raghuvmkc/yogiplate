import { NextResponse } from "next/server";
import { deliveryProblem, quoteDelivery } from "@/lib/delivery";
import { reportError } from "@/lib/monitor";
import { getSettings } from "@/lib/repo";

/** Live address check for forms: verifies the street and returns miles and the delivery fee. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address, city, subtotal } = body;
    const zip = String(body.zip || "");
    const state = body.state || "CA";
    if (!address || !city) {
      return NextResponse.json(
        { error: "Address and city are required." },
        { status: 400 }
      );
    }
    const settings = await getSettings();
    const quote = await quoteDelivery({
      address,
      city,
      state,
      zip,
      subtotal: Number(subtotal) || 0,
      settings,
    });
    return NextResponse.json({ ...quote, problem: deliveryProblem(quote) });
  } catch (err) {
    await reportError("delivery-quote", err);
    return NextResponse.json(
      { error: "Unable to calculate delivery." },
      { status: 500 }
    );
  }
}
