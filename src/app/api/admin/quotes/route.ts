import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { emailQuote, listQuotes } from "@/lib/quotes";
import { listReminders, processDueReminders } from "@/lib/reminders";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [quotes, reminders] = await Promise.all([listQuotes(), listReminders()]);
  return NextResponse.json({ quotes, reminders });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "resend_quote" && body.quote_id) {
    const result = await emailQuote(String(body.quote_id));
    return NextResponse.json(result);
  }
  if (action === "process_reminders") {
    const result = await processDueReminders(40);
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
