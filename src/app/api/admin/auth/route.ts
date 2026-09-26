import { NextResponse } from "next/server";
import {
  clearAdminSession,
  isAdminAuthenticated,
  setAdminSession,
  verifyAdmin,
} from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ authenticated: await isAdminAuthenticated() });
}

export async function POST(req: Request) {
  const body = await req.json();
  const ok = await verifyAdmin(
    String(body.email || ""),
    String(body.password || "")
  );
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
