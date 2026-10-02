import { NextResponse } from "next/server";
import { isSarvamConfigured, sarvamTranscribe } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isSarvamConfigured()) {
    return NextResponse.json(
      { error: "Voice is not configured (missing SARVAM_API_KEY).", code: "no_key" },
      { status: 503 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const locale = String(form.get("locale") || "").trim() || undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file.", code: "bad_request" },
        { status: 400 }
      );
    }

    if (file.size > 8_000_000) {
      return NextResponse.json(
        { error: "Audio too large (max 8MB).", code: "too_large" },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    // Prefer WAV from browser mic; fall back by filename extension.
    const name = file.name?.toLowerCase() || "";
    const mime =
      file.type ||
      (name.endsWith(".wav")
        ? "audio/wav"
        : name.endsWith(".webm")
          ? "audio/webm"
          : "audio/wav");

    console.info(
      `[voice/stt] bytes=${buf.length} mime=${mime} name=${file.name || "?"}`
    );

    const result = await sarvamTranscribe(buf, mime, locale);

    return NextResponse.json({
      text: result.text,
      language_code: result.language_code ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voice/stt]", msg);
    return NextResponse.json(
      { error: "Could not hear that — try again.", detail: msg.slice(0, 200) },
      { status: 502 }
    );
  }
}
