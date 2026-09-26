import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { computeAgentMetrics } from "@/lib/chat/metrics";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const metrics = await computeAgentMetrics();
  return NextResponse.json(metrics);
}
