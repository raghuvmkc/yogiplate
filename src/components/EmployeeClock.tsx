"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

type Choice = { id: string; name: string };
type PunchNotice = { action: "in" | "out"; message: string; at: string };

export function EmployeeClock() {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<PunchNotice | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setDigits("");
      setChoices(null);
      setError("");
    }, 6800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function submit(pin: string, employeeId?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/employee/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, employee_id: employeeId }),
      });
      const data = (await res.json()) as {
        error?: string;
        choose?: Choice[];
        message?: string;
        action?: "in" | "out";
        at?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not clock in.");
      if (data.choose?.length) {
        setChoices(data.choose);
        return;
      }
      setChoices(null);
      setNotice({
        action: data.action === "out" ? "out" : "in",
        message: data.message || "Welcome.",
        at: data.at || "",
      });
    } catch (err) {
      setDigits("");
      setChoices(null);
      setError(err instanceof Error ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy || notice) return;
    setError("");
    setChoices(null);
    if (key === "clear") {
      setDigits("");
      return;
    }
    if (key === "back") {
      setDigits((value) => value.slice(0, -1));
      return;
    }
    setDigits((value) => {
      if (value.length >= 4) return value;
      const next = value + key;
      if (next.length === 4) void submit(next);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#1e3d2f] px-4 py-6 text-white">
      <Image
        src="/images/Yogiplate_Logo_transparent.png"
        alt="Yogiplate"
        width={140}
        height={140}
        priority
        className="h-20 w-20 object-contain sm:h-28 sm:w-28"
      />
      <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#d4b483]">
        Yogiplate kitchen
      </p>
      {notice ? (
        <div
          className={`mt-6 w-full max-w-md border-4 px-6 py-8 text-center ${
            notice.action === "in"
              ? "border-[#d4b483] bg-[#d4b483] text-[#1e3d2f]"
              : "border-white bg-white text-[#1e3d2f]"
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.22em]">
            {notice.action === "in" ? "Logged in" : "Logged out"}
          </p>
          <h1
            className="mt-2 text-4xl sm:text-5xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {notice.message}
          </h1>
          {notice.at ? (
            <p className="mt-4 text-lg font-semibold">{notice.at}</p>
          ) : null}
        </div>
      ) : (
        <>
      <h1
        className="mt-3 text-center text-4xl sm:text-5xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {busy ? "One moment" : "Enter your code"}
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-white/80">
        Two digits for your birth month, then two for the day. March 5 is 0305.
      </p>

      <div className="mt-5 flex gap-3" aria-label="Code">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="flex h-16 w-14 items-center justify-center border border-white/30 bg-white/10 text-3xl font-semibold"
          >
            {digits[index] ? "•" : ""}
          </span>
        ))}
      </div>

      {error ? <p className="mt-4 text-center text-sm font-semibold text-amber-200">{error}</p> : null}

      {busy ? (
        <div className="mt-8 flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span className="h-14 w-14 animate-spin rounded-full border-4 border-white/30 border-t-[#d4b483]" />
          <p className="text-sm font-semibold">Saving your time…</p>
        </div>
      ) : choices ? (
        <div className="mt-6 flex w-full max-w-md flex-col gap-3">
          <p className="text-center text-sm">Two people share this birthday. Who is this?</p>
          {choices.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={busy}
              onClick={() => void submit(digits, person.id)}
              className="bg-white px-4 py-4 text-lg font-semibold text-[#1e3d2f] disabled:opacity-50"
            >
              {person.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid w-full max-w-xs grid-cols-3 gap-3">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy || Boolean(notice)}
              onClick={() => press(key)}
              className="h-16 bg-white text-xl font-semibold text-[#1e3d2f] disabled:opacity-40"
            >
              {key === "clear" ? "Clear" : key === "back" ? "⌫" : key}
            </button>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
