import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { buildDayOrderSummary } from "@/lib/day-order-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const date = new URL(req.url).searchParams.get("date") || "";
  try {
    const result = await buildDayOrderSummary(date);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build day summary.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
