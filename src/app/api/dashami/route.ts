import { NextResponse } from "next/server";
import { startDashamiCheckout } from "@/lib/dashami";
import { GuestInputError } from "@/lib/guest-error";
import { reportError } from "@/lib/monitor";
import { guestPaymentErrorMessage } from "@/lib/payment-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await startDashamiCheckout({
      customer_name: String(body.customer_name || ""),
      customer_email: String(body.customer_email || ""),
      customer_phone: String(body.customer_phone || ""),
      address: String(body.address || ""),
      city: String(body.city || ""),
      zip: String(body.zip || ""),
      bread: body.bread === "chapati" ? "chapati" : "puri",
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GuestInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    await reportError("dashami", err);
    return NextResponse.json(
      {
        error:
          guestPaymentErrorMessage(err) ||
          "Payment could not start. Please try again, or call (408) 335-4055.",
      },
      { status: 500 }
    );
  }
}
