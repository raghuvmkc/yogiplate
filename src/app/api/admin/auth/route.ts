import { NextResponse } from "next/server";
import {
  canIssueRefunds,
  clearAdminSession,
  isAdminAuthenticated,
  setAdminSession,
  touchAdminSession,
  verifyAdmin,
} from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    authenticated: await isAdminAuthenticated(),
    can_refund: await canIssueRefunds(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "");
  const ok = await verifyAdmin(email, String(body.password || ""));
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await setAdminSession(email);
  return NextResponse.json({ ok: true, can_refund: await canIssueRefunds() });
}

/** Activity ping from the admin idle lock. */
export async function PATCH() {
  if (!(await touchAdminSession())) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
