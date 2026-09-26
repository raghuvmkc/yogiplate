"use client";

import { formatMoney } from "@/lib/pricing";

export type ChatHighlight = { label: string; value: string };

export type ChatMenuLine = {
  name: string;
  quantity: number;
  unit?: string;
  price?: number;
  line_total?: number;
};

function stripMarkdownDecorators(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .trim();
}

function lineAmount(line: ChatMenuLine): number | null {
  if (line.line_total != null && Number.isFinite(line.line_total)) {
    return line.line_total;
  }
  if (
    line.price != null &&
    Number.isFinite(line.price) &&
    Number.isFinite(line.quantity)
  ) {
    return Math.round(line.price * line.quantity * 100) / 100;
  }
  return null;
}

export function ChatRichMessage({
  content,
  highlights,
  bullets,
  lines,
  linesTotal,
  linesTitle,
}: {
  content: string;
  highlights?: ChatHighlight[];
  bullets?: string[];
  lines?: ChatMenuLine[];
  linesTotal?: number | null;
  linesTitle?: string | null;
}) {
  const prose = stripMarkdownDecorators(content || "");
  const menuLines = (lines || [])
    .filter((l) => l && String(l.name || "").trim())
    .slice(0, 10);
  const hasExtras =
    (highlights && highlights.length > 0) ||
    (bullets && bullets.length > 0) ||
    menuLines.length > 0;

  const computedTotal =
    linesTotal != null && Number.isFinite(linesTotal)
      ? linesTotal
      : menuLines.length
        ? menuLines.reduce((sum, l) => sum + (lineAmount(l) ?? 0), 0)
        : null;
  const showTotal =
    computedTotal != null &&
    computedTotal > 0 &&
    (linesTotal != null || menuLines.some((l) => lineAmount(l) != null));

  return (
    <div className="space-y-2.5">
      <p className="whitespace-pre-wrap leading-relaxed">{prose}</p>

      {menuLines.length > 0 ? (
        <div className="border-t border-line/80 pt-2">
          {linesTitle ? (
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-accent-deep">
              {stripMarkdownDecorators(linesTitle)}
            </p>
          ) : null}
          <ol className="space-y-2">
            {menuLines.map((line, i) => {
              const amount = lineAmount(line);
              const qty = Math.max(1, Number(line.quantity) || 1);
              const unit = (line.unit || "").trim();
              return (
                <li
                  key={`${i}-${line.name}`}
                  className="flex items-start gap-2.5 text-[13px] leading-snug"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-accent-deep/10 text-[11px] font-bold text-accent-deep"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-foreground">
                        {stripMarkdownDecorators(line.name)}
                      </p>
                      {amount != null ? (
                        <p className="shrink-0 font-semibold tabular-nums text-accent-deep">
                          {formatMoney(amount)}
                        </p>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {qty} × {unit || "each"}
                      {line.price != null && amount != null && qty > 1
                        ? ` · ${formatMoney(line.price)} each`
                        : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {showTotal ? (
            <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-line pt-2 text-[13px]">
              <span className="font-medium text-muted">Food estimate</span>
              <span className="font-semibold tabular-nums text-accent-deep">
                {formatMoney(computedTotal!)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

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
              <span>{stripMarkdownDecorators(b)}</span>
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
