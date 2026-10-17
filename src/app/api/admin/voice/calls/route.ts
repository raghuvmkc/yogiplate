import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { listVoiceCalls } from "@/lib/twilio-voice";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const calls = await listVoiceCalls();
    return NextResponse.json(
      { calls },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load calls." }, { status: 500 });
  }
}
