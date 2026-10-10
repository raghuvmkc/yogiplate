import { NextResponse } from "next/server";
import { createGuestVoiceToken, voiceConfigured } from "@/lib/twilio-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 30 * 60 * 1000;
const MAX_PER_WINDOW = 4;
const recent = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > MAX_PER_WINDOW;
}

/**
 * Lets a website guest place one browser call to the store manager.
 * The token can only call out, and the outgoing TwiML only lets guest
 * identities ring the manager desk, never an outside number.
 */
export async function POST(req: Request) {
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Calling is not available right now." }, { status: 503 });
  }
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "local";
  if (rateLimited(ip.split(",")[0]!.trim())) {
    return NextResponse.json(
      { error: "Too many call attempts. Our store manager will call you as soon as he is available." },
      { status: 429 }
    );
  }
  const { token } = createGuestVoiceToken();
  return NextResponse.json({ token });
}
