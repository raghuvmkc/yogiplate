"use client";

export type ChatHighlight = { label: string; value: string };

export function ChatRichMessage({
  content,
  highlights,
  bullets,
}: {
  content: string;
  highlights?: ChatHighlight[];
  bullets?: string[];
}) {
  const hasExtras =
    (highlights && highlights.length > 0) || (bullets && bullets.length > 0);

  return (
    <div className="space-y-2.5">
      <p className="whitespace-pre-wrap leading-relaxed">{content}</p>

      {highlights && highlights.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {highlights.map((h, i) => (
            <div
              key={`${h.label}-${i}`}
              className="border border-logo-gold/35 bg-[linear-gradient(135deg,#f7faf8_0%,#fffef8_100%)] px-2.5 py-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                {h.label}
              </p>
              <p className="mt-0.5 font-display text-[0.95rem] font-semibold leading-snug text-accent-deep">
                {h.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {bullets && bullets.length > 0 ? (
        <ul className="space-y-1 border-t border-line/80 pt-2">
          {bullets.map((b, i) => (
            <li
              key={`${i}-${b.slice(0, 12)}`}
              className="flex gap-2 text-[13px] font-medium leading-snug text-foreground"
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-logo-gold"
                aria-hidden
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasExtras ? (
        <p className="text-[10px] font-medium tracking-wide text-muted">
          Key details from AI Yogi
        </p>
      ) : null}
    </div>
  );
}
