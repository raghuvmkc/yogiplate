/** Short soft phone-style ring using Web Audio (no asset file). */

export async function playPhoneRing(opts?: {
  bursts?: number;
  volume?: number;
}): Promise<void> {
  const bursts = Math.max(1, opts?.bursts ?? 1);
  const volume = opts?.volume ?? 0.12;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;

  const ctx = new Ctx();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }

  const burstDuration = 0.7;
  const burstGap = 0.95;

  const playBurst = (startAt: number) => {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const gain = ctx.createGain();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 440;
    o2.frequency.value = 480;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.03);
    gain.gain.setValueAtTime(volume, startAt + burstDuration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + burstDuration);
    o1.connect(gain);
    o2.connect(gain);
    gain.connect(ctx.destination);
    o1.start(startAt);
    o2.start(startAt);
    o1.stop(startAt + burstDuration + 0.02);
    o2.stop(startAt + burstDuration + 0.02);
  };

  const now = ctx.currentTime + 0.02;
  for (let i = 0; i < bursts; i++) {
    playBurst(now + i * burstGap);
  }

  const totalMs = Math.ceil((bursts - 1) * burstGap * 1000 + burstDuration * 1000 + 80);
  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
      resolve();
    }, totalMs);
  });
}
