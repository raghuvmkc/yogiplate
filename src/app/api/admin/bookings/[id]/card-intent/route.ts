import { NextResponse } from "next/server";
import { createBookingCardIntent } from "@/lib/admin-card-payment";
import { isAdminAuthenticated } from "@/lib/auth";
import { serverEnv } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { amount?: number };
  try {
    const intent = await createBookingCardIntent(id, Number(body.amount) || 0);
    const publishableKey = serverEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) {
      return NextResponse.json(
        { error: "Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY so the desk can enter cards." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ...intent, publishable_key: publishableKey },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start card payment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
