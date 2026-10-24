import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  buildCalendarBackup,
  calendarBackupFilename,
} from "@/lib/calendar-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click calendar backup: every booking field plus linked orders, invoices, quotes, and blocks. */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await buildCalendarBackup();
  const body = JSON.stringify(payload, null, 2);
  const filename = calendarBackupFilename();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Calendar-Backup-Filename": filename,
    },
  });
}
