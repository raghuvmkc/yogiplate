import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { staffHistoryCsv } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const csv = await staffHistoryCsv();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yogiplate-kitchen-hours-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
