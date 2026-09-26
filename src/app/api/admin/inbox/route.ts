import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listChannelThreads } from "@/lib/channels/inbound";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const threads = await listChannelThreads();
  return NextResponse.json({ threads });
}
