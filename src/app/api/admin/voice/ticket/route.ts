import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { issueCallTicket, voiceConfigured } from "@/lib/twilio-voice";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Twilio Voice is not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const ticket = await issueCallTicket(String(body.to || ""));
  if (!ticket) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  return NextResponse.json({ ticket: ticket.id, to: ticket.to });
}
