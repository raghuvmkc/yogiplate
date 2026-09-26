import { NextResponse } from "next/server";
import { quoteDelivery } from "@/lib/delivery";
import { getSettings } from "@/lib/repo";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address, city, state, zip, subtotal } = body;
    if (!address || !city || !state || !zip) {
      return NextResponse.json(
        { error: "Address, city, state, and ZIP are required." },
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
    return NextResponse.json(quote);
  } catch {
    return NextResponse.json(
      { error: "Unable to calculate delivery." },
      { status: 500 }
    );
  }
}
