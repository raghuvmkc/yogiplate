"use client";

import { useEffect, useRef, useState } from "react";

const IDLE_MS = 30 * 60 * 1000;
const WARN_MS = 2 * 60 * 1000;
const PING_MS = 60 * 1000;
/** Shared across admin tabs so activity in one tab keeps the others unlocked. */
const ACTIVE_KEY = "yogiplate-admin-active";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

function lockTo() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/admin/login?locked=1&next=${encodeURIComponent(next)}`;
}

/**
 * Signs the admin out after 30 minutes without mouse, keyboard, or touch activity.
 * Pages set document.body.dataset.adminBusy = "1" (e.g. during a desk phone call) to stay unlocked.
 */
export function AdminIdleLock() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const markRef = useRef<() => void>(() => {});

  useEffect(() => {
    let local = Date.now();
    let lastPing = local;
    let locking = false;

    const shared = () => {
      try {
        return Number(localStorage.getItem(ACTIVE_KEY)) || 0;
      } catch {
        return 0;
      }
    };
    const mark = (force = false) => {
      const now = Date.now();
      if (!force && now - local < 5000) return;
      local = now;
      try {
        localStorage.setItem(ACTIVE_KEY, String(now));
      } catch {
        /* private mode */
      }
    };
    markRef.current = () => {
      mark(true);
      setSecondsLeft(null);
    };
    const onActivity = () => mark();
    mark(true);

    const lock = async () => {
      if (locking) return;
      locking = true;
      await fetch("/api/admin/auth", { method: "DELETE" }).catch(() => null);
      lockTo();
    };

    const tick = async () => {
      if (locking) return;
      if (document.body.dataset.adminBusy === "1") mark();
      const last = Math.max(local, shared());
      const idle = Date.now() - last;
      if (idle >= IDLE_MS) {
        await lock();
        return;
      }
      const left = IDLE_MS - idle;
      setSecondsLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
      if (last > lastPing && Date.now() - lastPing >= PING_MS) {
        lastPing = Date.now();
        const res = await fetch("/api/admin/auth", { method: "PATCH" }).catch(() => null);
        if (res?.status === 401) {
          locking = true;
          lockTo();
        }
      }
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.clearInterval(timer);
    };
  }, []);

  if (secondsLeft == null) return null;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-4 border border-line bg-white px-4 py-3 shadow-lg">
        <p className="text-sm text-foreground">
          For security, the admin will lock in <span className="font-semibold">{mm}:{ss}</span>.
        </p>
        <button
          type="button"
          onClick={() => markRef.current()}
          className="bg-accent-deep px-3 py-1.5 text-sm font-semibold text-white"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
