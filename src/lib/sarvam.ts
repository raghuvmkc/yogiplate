import { speakableText, speakableForCall } from "@/lib/speakable";

export { speakableText, speakableForCall };

const SARVAM_BASE = "https://api.sarvam.ai";

export function isSarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY?.trim());
}

function apiKey(): string {
  return (process.env.SARVAM_API_KEY || "").trim();
}

function ttsSpeaker(): string {
  return (process.env.SARVAM_TTS_SPEAKER || "priya").toLowerCase().trim();
}

function ttsModel(): string {
  return (process.env.SARVAM_TTS_MODEL || "bulbul:v3").trim();
}

function sttModel(): string {
  return (process.env.SARVAM_STT_MODEL || "saaras:v3").trim();
}

/** Map short locale → Sarvam BCP-47. */
export function sarvamLanguageCode(locale?: string): string {
  const l = (locale || "en").toLowerCase().slice(0, 2);
  if (l === "hi") return "hi-IN";
  if (l === "te") return "te-IN";
  if (l === "ta") return "ta-IN";
  if (l === "bn") return "bn-IN";
  if (l === "gu") return "gu-IN";
  if (l === "kn") return "kn-IN";
  if (l === "ml") return "ml-IN";
  if (l === "mr") return "mr-IN";
  if (l === "pa") return "pa-IN";
  return "en-IN";
}

function chunkText(text: string, max = 2400): string[] {
  const t = text.trim();
  if (t.length <= max) return t ? [t] : [];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function concatWavBuffers(parts: Buffer[]): Buffer {
  if (parts.length === 0) return Buffer.alloc(0);
  if (parts.length === 1) return parts[0]!;

  const pcms: Buffer[] = [];
  let totalPcm = 0;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;

  for (const wav of parts) {
    if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
      pcms.push(wav);
      totalPcm += wav.length;
      continue;
    }
    sampleRate = wav.readUInt32LE(24);
    channels = wav.readUInt16LE(22);
    bitsPerSample = wav.readUInt16LE(34);
    const pcm = wav.subarray(44);
    pcms.push(pcm);
    totalPcm += pcm.length;
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + totalPcm, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(totalPcm, 40);
  return Buffer.concat([header, ...pcms]);
}

/** Sarvam rejects types like audio/webm;codecs=opus — keep only the base type. */
function normalizeAudioMime(mimeType: string): { mime: string; ext: string } {
  const raw = (mimeType || "").toLowerCase().split(";")[0]!.trim();
  if (raw.includes("wav") || raw.includes("wave") || raw.includes("pcm") || raw === "audio/l16") {
    return { mime: "audio/wav", ext: "wav" };
  }
  if (raw.includes("mpeg") || raw.includes("mp3")) {
    return { mime: "audio/mpeg", ext: "mp3" };
  }
  if (raw.includes("ogg")) return { mime: "audio/ogg", ext: "ogg" };
  if (raw.includes("opus") && !raw.includes("webm")) {
    return { mime: "audio/opus", ext: "opus" };
  }
  if (raw.includes("webm")) return { mime: "audio/webm", ext: "webm" };
  if (raw.includes("mp4") || raw.includes("m4a")) {
    return { mime: "audio/mp4", ext: "m4a" };
  }
  // Default: WAV is the most reliable with Saaras
  return { mime: "audio/wav", ext: "wav" };
}

export async function sarvamTranscribe(
  audio: Buffer,
  mimeType: string,
  locale?: string
): Promise<{ text: string; language_code?: string }> {
  const key = apiKey();
  if (!key) throw new Error("SARVAM_API_KEY is not configured");
  if (audio.length < 32) return { text: "" };

  const { mime, ext } = normalizeAudioMime(mimeType);

  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: mime });
  form.append("file", blob, `audio.${ext}`);
  form.append("model", sttModel());
  form.append("mode", "transcribe");
  // unknown = Saaras auto-detect (works better for mixed EN/Indic speech)
  form.append("language_code", locale ? sarvamLanguageCode(locale) : "unknown");

  const res = await fetch(`${SARVAM_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    transcript?: string;
    language_code?: string;
    error?: { message?: string };
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error?.message || data.message || `Sarvam STT HTTP ${res.status}`
    );
  }

  return {
    text: String(data.transcript ?? "").trim(),
    language_code: data.language_code,
  };
}

export async function sarvamSynthesize(
  text: string,
  locale = "en",
  opts?: { pace?: number; speaker?: string }
): Promise<{ wav: Buffer; voice: string }> {
  const key = apiKey();
  if (!key) throw new Error("SARVAM_API_KEY is not configured");

  const spoken = speakableText(text);
  const speaker = (opts?.speaker || ttsSpeaker()).toLowerCase().trim();
  const language_code = sarvamLanguageCode(locale);
  const pace =
    typeof opts?.pace === "number" && opts.pace > 0 && opts.pace <= 1.5
      ? opts.pace
      : 1.0;
  const chunks = chunkText(spoken, 2400);
  if (!chunks.length) {
    return { wav: Buffer.alloc(0), voice: speaker };
  }

  const wavParts: Buffer[] = [];
  for (const chunk of chunks) {
    const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: chunk,
        target_language_code: language_code,
        language_code,
        speaker,
        model: ttsModel(),
        pace,
        speech_sample_rate: 24000,
        output_audio_codec: "wav",
        temperature: 0.6,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      audios?: string[];
      error?: { message?: string };
      message?: string;
    };

    if (!res.ok) {
      throw new Error(
        data.error?.message || data.message || `Sarvam TTS HTTP ${res.status}`
      );
    }

    const clips = data.audios ?? [];
    if (!clips.length) throw new Error("Sarvam TTS returned no audio");
    for (const b64 of clips) {
      if (b64) wavParts.push(Buffer.from(b64, "base64"));
    }
  }

  return { wav: concatWavBuffers(wavParts), voice: speaker };
}
