import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  findCalendarCaller,
  formatCalendarCallerLabel,
} from "@/lib/caller-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Look up a Twilio caller against calendar event phones. */
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const phone = new URL(req.url).searchParams.get("phone") || "";
  if (!phone.trim()) {
    return NextResponse.json({ match: null, label: null });
  }
  const match = await findCalendarCaller(phone);
  return NextResponse.json(
    {
      match,
      label: match ? formatCalendarCallerLabel(match) : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
