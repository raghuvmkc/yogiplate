import { speakableText } from "@/lib/speakable";
import { serverEnv } from "@/lib/server-env";

const DEFAULT_MODEL = "gemini-2.5-flash-preview-tts";

function apiKey() {
  return serverEnv("GEMINI_API_KEY");
}

export function isGoogleTtsConfigured() {
  return Boolean(apiKey());
}

function googleTtsModel() {
  return serverEnv("GOOGLE_TTS_MODEL", DEFAULT_MODEL);
}

function pcmToWav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sampleRateFromMime(mime: string) {
  const m = /rate=(\d+)/i.exec(mime);
  const n = m ? Number(m[1]) : 24000;
  return Number.isFinite(n) && n > 0 ? n : 24000;
}

export async function googleSynthesize(
  text: string,
  voice: string
): Promise<{ wav: Buffer; voice: string }> {
  const key = apiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const spoken = speakableText(text);
  if (!spoken) return { wav: Buffer.alloc(0), voice };

  const model = googleTtsModel();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: spoken }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      }),
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: {
      content?: {
        parts?: { inlineData?: { mimeType?: string; data?: string } }[];
      };
    }[];
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `Google TTS HTTP ${res.status}`);
  }

  const part = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  );
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error("Google TTS returned no audio");

  const raw = Buffer.from(b64, "base64");
  const mime = part?.inlineData?.mimeType || "";
  const wav =
    raw.length >= 12 && raw.toString("ascii", 0, 4) === "RIFF"
      ? raw
      : pcmToWav(raw, sampleRateFromMime(mime));
  return { wav, voice };
}
