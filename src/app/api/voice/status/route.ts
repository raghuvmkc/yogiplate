import { NextResponse } from "next/server";
import { isSarvamConfigured } from "@/lib/sarvam";
import {
  GOOGLE_TTS_VOICE_OPTIONS,
  SARVAM_TTS_VOICE_OPTIONS,
  isVoiceCallConfigured,
  ttsProvider,
  ttsVoice,
} from "@/lib/tts";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: isVoiceCallConfigured(),
    provider: ttsProvider(),
    speaker: ttsVoice(),
    voices:
      ttsProvider() === "google"
        ? GOOGLE_TTS_VOICE_OPTIONS
        : SARVAM_TTS_VOICE_OPTIONS,
    stt: isSarvamConfigured(),
  });
}
