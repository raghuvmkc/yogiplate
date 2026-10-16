import { NextResponse } from "next/server";
import { clockByPin } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pin?: string; employee_id?: string };
  try {
    const result = await clockByPin(String(body.pin || ""), body.employee_id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not clock in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
