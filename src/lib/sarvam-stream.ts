import WebSocket from "ws";
import { serverEnv } from "@/lib/server-env";
import { sarvamLanguageCode } from "@/lib/sarvam";
import { finishedSentences, speakableForCall } from "@/lib/speakable";

const TTS_WS_URL = "wss://api.sarvam.ai/text-to-speech/ws";

/** Same limits the browser used for call speech: first two sentences, at most 320 characters. */
const CALL_SPEECH_SENTENCES = 2;
const CALL_SPEECH_CHARS = 320;

export type SarvamTtsStream = {
  /** Live reply text so far for one model round; speaks each newly finished sentence. */
  feed(round: number, text: string): void;
  /** Final reply: speak whatever it adds, unless it no longer starts with what was spoken. */
  finish(reply: string): void;
  /** Resolves when every flushed sentence has finished generating, or after `timeoutMs`. */
  drained(timeoutMs: number): Promise<{ ok: boolean; sentences: number; chunks: number }>;
  close(): void;
};

/**
 * Server-side Sarvam streaming TTS. The API key stays on the server; MP3 chunks are
 * handed to `onAudio` as base64 so the chat stream can forward them to the browser.
 */
export function openSarvamTtsStream(opts: {
  onAudio: (base64Mp3: string) => void;
  locale?: string;
  pace?: number;
}): SarvamTtsStream {
  const key = serverEnv("SARVAM_API_KEY");
  const model = serverEnv("SARVAM_TTS_MODEL", "bulbul:v3");
  const speaker = (serverEnv("TTS_VOICE") || serverEnv("SARVAM_TTS_SPEAKER", "priya")).toLowerCase();

  const spoken: string[] = [];
  let chars = 0;
  let speakRound: number | null = null;
  let pendingFlushes = 0;
  let chunks = 0;
  let failed = false;
  let closed = false;
  const outbox: string[] = [];
  let onSettled: (() => void) | null = null;

  const ws = new WebSocket(
    `${TTS_WS_URL}?model=${encodeURIComponent(model)}&send_completion_event=true`,
    { headers: { "Api-Subscription-Key": key } }
  );

  const settle = () => {
    if (pendingFlushes <= 0 || failed) onSettled?.();
  };
  const fail = (why: string) => {
    if (failed) return;
    failed = true;
    console.error("[tts-stream]", why);
    settle();
  };
  const send = (msg: Record<string, unknown>) => {
    const raw = JSON.stringify(msg);
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    else if (ws.readyState === WebSocket.CONNECTING) outbox.push(raw);
  };

  send({
    type: "config",
    data: {
      language_code: sarvamLanguageCode(opts.locale),
      speaker,
      pace: opts.pace ?? 1.08,
      output_audio_codec: "mp3",
      output_audio_bitrate: "64k",
      min_buffer_size: 30,
      max_chunk_length: 200,
    },
  });

  ws.on("open", () => {
    for (const raw of outbox.splice(0)) ws.send(raw);
  });
  ws.on("message", (data) => {
    let msg: { type?: string; data?: { audio?: string; event_type?: string; message?: string } };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "audio" && msg.data?.audio) {
      chunks += 1;
      opts.onAudio(msg.data.audio);
    } else if (msg.type === "event" && msg.data?.event_type === "final") {
      pendingFlushes = Math.max(0, pendingFlushes - 1);
      settle();
    } else if (msg.type === "error") {
      fail(msg.data?.message || "Sarvam TTS stream error");
    }
  });
  ws.on("unexpected-response", (_req, res) => fail(`Sarvam TTS stream HTTP ${res.statusCode}`));
  ws.on("error", (err) => fail(err.message));
  ws.on("close", () => {
    if (!closed && pendingFlushes > 0) fail("Sarvam TTS stream closed early");
  });

  function speak(sentence: string): boolean {
    if (spoken.length >= CALL_SPEECH_SENTENCES) return false;
    if (spoken.length && chars + sentence.length + 1 > CALL_SPEECH_CHARS) return false;
    spoken.push(sentence);
    chars += sentence.length + 1;
    const text = speakableForCall(sentence);
    if (!text || failed) return true;
    pendingFlushes += 1;
    send({ type: "text", data: { text } });
    send({ type: "flush" });
    return true;
  }

  function speakFrom(sentences: string[]) {
    for (const s of sentences.slice(spoken.length)) {
      if (!speak(s)) break;
    }
  }

  const sameWords = (a = "", b = "") =>
    a.toLowerCase().replace(/[^a-z0-9]+/g, "") === b.toLowerCase().replace(/[^a-z0-9]+/g, "");

  return {
    feed(round, text) {
      if (speakRound !== round) {
        if (spoken.length) return;
        speakRound = round;
      }
      speakFrom(finishedSentences(text));
    },
    finish(reply) {
      const all = finishedSentences(reply, true);
      if (spoken.every((s, i) => sameWords(all[i], s))) speakFrom(all);
    },
    drained(timeoutMs) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          onSettled = null;
          resolve({ ok: false, sentences: spoken.length, chunks });
        }, Math.max(0, timeoutMs));
        onSettled = () => {
          clearTimeout(timer);
          onSettled = null;
          resolve({ ok: !failed, sentences: spoken.length, chunks });
        };
        settle();
      });
    },
    close() {
      closed = true;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    },
  };
}
