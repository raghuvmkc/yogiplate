import { googleSynthesize, isGoogleTtsConfigured } from "@/lib/google-tts";
import { isSarvamConfigured, sarvamSynthesize } from "@/lib/sarvam";
import { serverEnv } from "@/lib/server-env";

export type TtsProvider = "google" | "sarvam";

/** Short lists kept in .env.example. Other ids still pass through. */
export const GOOGLE_TTS_VOICE_OPTIONS = ["Kore", "Aoede", "Charon"] as const;
export const SARVAM_TTS_VOICE_OPTIONS = ["priya", "neha", "rahul"] as const;

export function ttsProvider(): TtsProvider {
  const raw = serverEnv("TTS_PROVIDER", "sarvam").toLowerCase();
  return raw === "google" ? "google" : "sarvam";
}

export function ttsVoice(): string {
  const explicit = serverEnv("TTS_VOICE");
  if (ttsProvider() === "google") {
    return explicit || "Kore";
  }
  return (explicit || serverEnv("SARVAM_TTS_SPEAKER", "priya")).toLowerCase();
}

export function isTtsConfigured(): boolean {
  return ttsProvider() === "google"
    ? isGoogleTtsConfigured()
    : isSarvamConfigured();
}

/** Call audio needs speech-to-text (Sarvam) and the selected TTS provider. */
export function isVoiceCallConfigured(): boolean {
  return isSarvamConfigured() && isTtsConfigured();
}

export async function synthesizeSpeech(
  text: string,
  locale = "en",
  opts?: { pace?: number }
): Promise<{ wav: Buffer; voice: string; provider: TtsProvider }> {
  const provider = ttsProvider();
  const voice = ttsVoice();
  if (provider === "google") {
    const result = await googleSynthesize(text, voice);
    return { ...result, provider };
  }
  const result = await sarvamSynthesize(text, locale, {
    pace: opts?.pace,
    speaker: voice,
  });
  return { ...result, provider };
}
