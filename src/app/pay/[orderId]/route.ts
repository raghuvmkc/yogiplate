import { NextResponse } from "next/server";
import { refreshOpenPaySession, verifyPayInvoiceToken } from "@/lib/invoice-pay";
import { reportError } from "@/lib/monitor";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusRedirect(reason: string) {
  return NextResponse.redirect(`${siteUrl()}/pay/status?reason=${encodeURIComponent(reason)}`);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: rawId } = await context.params;
  const orderId = decodeURIComponent(rawId || "").trim();
  const token = new URL(req.url).searchParams.get("t");

  if (!orderId || !verifyPayInvoiceToken(orderId, token)) {
    return statusRedirect("invalid");
  }

  try {
    const result = await refreshOpenPaySession(orderId);
    if (result.status === "ok") {
      return NextResponse.redirect(result.url);
    }
    if (result.status === "paid") return statusRedirect("paid");
    if (result.status === "cancelled") return statusRedirect("cancelled");
    if (result.status === "stripe_unavailable") return statusRedirect("unavailable");
    return statusRedirect("invalid");
  } catch (err) {
    await reportError("invoice-pay", err);
    return statusRedirect("unavailable");
  }
}
