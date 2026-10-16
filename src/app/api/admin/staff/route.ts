import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { clockOutPunch, saveEmployee, staffSnapshot } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await staffSnapshot());
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    month?: number;
    day?: number;
    active?: boolean;
    punch_id?: string;
  };
  try {
    if (body.action === "clock_out") {
      await clockOutPunch(String(body.punch_id || ""));
    } else {
      await saveEmployee({
        id: body.id,
        name: String(body.name || ""),
        month: Number(body.month),
        day: Number(body.day),
        active: body.active,
      });
    }
    return NextResponse.json(await staffSnapshot());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
