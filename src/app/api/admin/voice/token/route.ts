import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { createManagerVoiceToken, voiceConfigured } from "@/lib/twilio-voice";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!voiceConfigured()) {
    return NextResponse.json(
      { error: "Twilio Voice is not configured.", configured: false },
      { status: 503 }
    );
  }
  return NextResponse.json({ token: createManagerVoiceToken() });
}
