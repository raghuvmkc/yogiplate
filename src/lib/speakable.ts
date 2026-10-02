/** Shared text cleanup for TTS (safe for client + server). */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function underThousand(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]}-${ONES[o]}` : TENS[t]!;
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest
    ? `${ONES[h]} hundred ${underThousand(rest)}`
    : `${ONES[h]} hundred`;
}

/** Convert non-negative integers up to 999,999,999 into English words. */
export function integerToWords(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x === 0) return "zero";
  if (x < 1000) return underThousand(x);
  if (x < 1_000_000) {
    const thousands = Math.floor(x / 1000);
    const rest = x % 1000;
    return rest
      ? `${underThousand(thousands)} thousand ${underThousand(rest)}`
      : `${underThousand(thousands)} thousand`;
  }
  const millions = Math.floor(x / 1_000_000);
  const rest = x % 1_000_000;
  if (!rest) return `${underThousand(millions)} million`;
  if (rest < 1000) {
    return `${underThousand(millions)} million ${underThousand(rest)}`;
  }
  return `${underThousand(millions)} million ${integerToWords(rest)}`;
}

/** "$2,058.00" → "two thousand fifty-eight dollars" */
export function moneyAmountToSpeakable(rawAmount: string): string {
  const cleaned = rawAmount.replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return `${cleaned} dollars`;
  const sign = n < 0 ? "minus " : "";
  const abs = Math.abs(n);
  const dollars = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - dollars) * 100);
  const dollarWords = integerToWords(dollars);
  const dollarUnit = dollars === 1 ? "dollar" : "dollars";
  if (cents <= 0) return `${sign}${dollarWords} ${dollarUnit}`;
  const centWords = integerToWords(cents);
  const centUnit = cents === 1 ? "cent" : "cents";
  return `${sign}${dollarWords} ${dollarUnit} and ${centWords} ${centUnit}`;
}

export function speakableText(raw: string): string {
  let t = String(raw || "");
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/[*_#~>]+/g, " ");
  // Currency with optional thousands separators: $2,058.00
  t = t.replace(/\$\s*([\d,]+(?:\.\d{1,2})?)/g, (_, amt: string) =>
    moneyAmountToSpeakable(amt)
  );
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 900) t = `${t.slice(0, 880).trim()}…`;
  return t;
}

/** First 1–2 sentences for low-latency call TTS. */
export function speakableForCall(raw: string, maxChars = 320): string {
  const t = speakableText(raw);
  if (!t) return "";
  const parts = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
  let out = "";
  for (const part of parts.slice(0, 2)) {
    const next = (out + " " + part.trim()).trim();
    if (out && next.length > maxChars) break;
    out = next;
    if (out.length >= maxChars) break;
  }
  if (!out) out = t.slice(0, maxChars).trim();
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).trim()}…`;
  return out;
}
