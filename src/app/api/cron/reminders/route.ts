import { NextResponse } from "next/server";
import { processDueReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export const maxDuration = 26;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const urlSecret = new URL(req.url).searchParams.get("secret") || "";
  return bearer === secret || urlSecret === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processDueReminders(40);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}
