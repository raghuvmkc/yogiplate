import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  calendarCallerLabelsForPhones,
  phoneMatchKey,
} from "@/lib/caller-calendar";
import { listVoiceCalls } from "@/lib/twilio-voice";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const calls = await listVoiceCalls();
    const phones = calls.flatMap((call) =>
      call.direction.startsWith("outbound") ? [call.to] : [call.from]
    );
    const labels = await calendarCallerLabelsForPhones(phones);
    const enriched = calls.map((call) => {
      const who = call.direction.startsWith("outbound") ? call.to : call.from;
      const key = phoneMatchKey(who);
      const calendar_label = key ? labels[key] || null : null;
      return { ...call, calendar_label };
    });
    return NextResponse.json(
      { calls: enriched },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load calls." }, { status: 500 });
  }
}
