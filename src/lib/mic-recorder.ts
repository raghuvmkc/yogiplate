/** Browser mic → 16-bit mono WAV (Sarvam-friendly), with continuous VAD for open conversation. */

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function rmsOf(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Open-mic conversation capture: stays on, cuts an utterance after silence,
 * and keeps listening until stop(). Mute while TTS / agent turn is busy.
 */
export class ContinuousMic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sampleRate = 16000;
  private floor = 0.02;
  private calibrated = false;
  private calibSamples: number[] = [];
  private speaking = false;
  private speakStart = 0;
  private silenceStartedAt = 0;
  private lastUtteranceAt = 0;
  private preRoll: Float32Array[] = [];
  private speechBuf: Float32Array[] = [];
  private onUtterance: ((wav: Blob) => void) | null = null;
  private isMuted: (() => boolean) | null = null;
  private stopped = true;
  private startGen = 0;

  async start(handlers: {
    onUtterance: (wav: Blob) => void;
    /** While true, discard audio (TTS playback / processing). */
    isMuted?: () => boolean;
  }) {
    this.onUtterance = handlers.onUtterance;
    this.isMuted = handlers.isMuted ?? null;
    this.stopped = false;
    this.calibrated = false;
    this.calibSamples = [];
    this.preRoll = [];
    this.speechBuf = [];
    this.speaking = false;
    this.silenceStartedAt = 0;
    const startGen = ++this.startGen;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (this.stopped || startGen !== this.startGen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.ctx = new AudioContext({ sampleRate: 16000 });
    this.sampleRate = this.ctx.sampleRate;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (ev) =>
      this.onAudio(ev.inputBuffer.getChannelData(0));
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    src.connect(this.processor);
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);
  }

  stop() {
    this.stopped = true;
    this.startGen += 1;
    this.onUtterance = null;
    this.isMuted = null;
    this.speechBuf = [];
    this.preRoll = [];
    this.speaking = false;
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.processor = null;
    this.stream = null;
    this.ctx = null;
  }

  private concatChunks(chunks: Float32Array[]): Float32Array {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(len);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  private emitSpeech() {
    if (!this.speechBuf.length) return;
    const samples = this.concatChunks(this.speechBuf);
    this.speechBuf = [];
    this.speaking = false;
    this.silenceStartedAt = 0;
    this.lastUtteranceAt = performance.now();
    // Ignore near-silent clips
    if (samples.length < this.sampleRate * 0.35) return;
    this.onUtterance?.(encodeWav(samples, this.sampleRate));
  }

  private onAudio(chunk: Float32Array) {
    if (this.stopped) return;

    if (this.isMuted?.()) {
      this.speaking = false;
      this.speechBuf = [];
      this.preRoll = [];
      this.silenceStartedAt = 0;
      return;
    }

    const frame = new Float32Array(chunk);
    const level = rmsOf(frame);

    if (!this.calibrated) {
      this.calibSamples.push(level);
      if (this.calibSamples.length >= 12) {
        const sorted = [...this.calibSamples].sort((a, b) => a - b);
        const mid = sorted[Math.floor(sorted.length * 0.5)] ?? 0.01;
        this.floor = Math.max(0.008, mid * 1.15);
        this.calibrated = true;
      }
      return;
    }

    const mul = 3.0;
    const minPeak = 0.03;
    const threshold = Math.max(this.floor * mul, minPeak);
    const holdThreshold = Math.max(this.floor * (mul * 0.55), minPeak * 0.55);
    const now = performance.now();
    const minSpeech = 350;
    const cooldown = 450;
    const maxSpeech = 16000;
    const endSilence = 1500;
    const preRollKeep = 3;

    if (!this.speaking && level < this.floor * 1.4) {
      this.floor = this.floor * 0.98 + level * 0.02;
    }

    const stillSpeaking = this.speaking
      ? level >= holdThreshold
      : level >= threshold;

    if (stillSpeaking) {
      this.silenceStartedAt = 0;
      if (!this.speaking) {
        if (now - this.lastUtteranceAt < cooldown) return;
        this.speaking = true;
        this.speakStart = now;
        this.speechBuf = [...this.preRoll, frame];
      } else {
        this.speechBuf.push(frame);
        if (
          now - this.speakStart >= maxSpeech &&
          now - this.lastUtteranceAt >= cooldown
        ) {
          this.emitSpeech();
        }
      }
      return;
    }

    // Idle — keep short pre-roll
    if (!this.speaking) {
      this.preRoll.push(frame);
      if (this.preRoll.length > preRollKeep) this.preRoll.shift();
      return;
    }

    // In speech, briefly quiet — hold or end
    this.speechBuf.push(frame);
    if (!this.silenceStartedAt) this.silenceStartedAt = now;
    const spokenMs = now - this.speakStart;
    if (
      spokenMs >= minSpeech &&
      now - this.silenceStartedAt >= endSilence
    ) {
      this.emitSpeech();
    }
  }
}
