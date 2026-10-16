"use client";

import { useEffect, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

type Choice = { id: string; name: string };

export function EmployeeClock() {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState("");
  const [choices, setChoices] = useState<Choice[] | null>(null);

  useEffect(() => {
    if (!welcome) return;
    const timer = window.setTimeout(() => {
      setWelcome("");
      setDigits("");
      setChoices(null);
      setError("");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [welcome]);

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
      };
      if (!res.ok) throw new Error(data.error || "Could not clock in.");
      if (data.choose?.length) {
        setChoices(data.choose);
        return;
      }
      setChoices(null);
      setWelcome(data.message || "Welcome.");
    } catch (err) {
      setDigits("");
      setChoices(null);
      setError(err instanceof Error ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy || welcome) return;
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#1e3d2f] px-4 py-10 text-white">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#d4b483]">
        Yogiplate kitchen
      </p>
      <h1
        className="mt-3 text-center text-4xl sm:text-5xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {welcome || "Enter your code"}
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-white/80">
        Two digits for your birth month, then two for the day. March 5 is 0305.
      </p>

      <div className="mt-8 flex gap-3" aria-label="Code">
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

      {choices ? (
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
        <div className="mt-8 grid w-full max-w-xs grid-cols-3 gap-3">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy || Boolean(welcome)}
              onClick={() => press(key)}
              className="h-16 bg-white text-xl font-semibold text-[#1e3d2f] disabled:opacity-40"
            >
              {key === "clear" ? "Clear" : key === "back" ? "⌫" : key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
