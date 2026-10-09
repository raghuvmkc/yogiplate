import { NextResponse, connection } from "next/server";
import { runHealthChecks } from "@/lib/health";

export const runtime = "nodejs";

/**
 * Public status for uptime monitors (UptimeRobot, Better Stack, ...).
 * HTTP 503 when a critical check fails. Details are on /admin/health only.
 */
export async function GET() {
  await connection();
  const report = await runHealthChecks();
  return NextResponse.json(
    {
      status: report.status,
      checked_at: report.checked_at,
      checks: Object.fromEntries(report.checks.map((c) => [c.name, c.ok ? "ok" : "failing"])),
    },
    {
      status: report.status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
