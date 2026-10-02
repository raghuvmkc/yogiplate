import { NextResponse } from "next/server";
import { speakableText } from "@/lib/sarvam";
import { isTtsConfigured, synthesizeSpeech } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isTtsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Voice is not configured. Set SARVAM_API_KEY, or TTS_PROVIDER=google with GEMINI_API_KEY.",
        code: "no_key",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      locale?: string;
      /** Slightly faster speech on live calls */
      call?: boolean;
    };
    const text = speakableText(String(body.text || ""));
    if (!text) {
      return NextResponse.json(
        { error: "Missing text.", code: "bad_request" },
        { status: 400 }
      );
    }

    const { wav, voice, provider } = await synthesizeSpeech(
      text,
      body.locale || "en",
      { pace: body.call ? 1.08 : 1.0 }
    );
    if (!wav.length) {
      return NextResponse.json(
        { error: "No audio returned.", code: "empty" },
        { status: 502 }
      );
    }

    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Tts-Provider": provider,
        "X-Tts-Voice": voice,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voice/tts]", msg);
    return NextResponse.json(
      { error: "Could not synthesize speech.", detail: msg.slice(0, 200) },
      { status: 502 }
    );
  }
}
