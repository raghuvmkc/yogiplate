const NAMES = [
  "Google",
  "LinkedIn",
  "SanDisk",
  "Uber",
  "Adobe",
  "Applied Materials",
  "illumino",
  "Upscale AI",
];

function NameSequence({ copy }: { copy: string }) {
  const names = [...NAMES, ...NAMES];
  return (
    <ul className="flex shrink-0 items-center">
      {names.map((name, index) => (
        <li key={`${copy}-${name}-${index}`} className="flex items-center">
          <span className="font-display px-4 text-[1.35rem] font-semibold tracking-tight text-accent-deep sm:px-6 sm:text-[1.7rem]">
            {name}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ClientLogoBand({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={compact ? "shrink-0 pl-3 pr-40 pt-2 sm:pl-5 sm:pr-48" : "py-8 sm:py-10"}
      aria-label="Corporate clients"
    >
      <div className="overflow-hidden border-y border-logo-gold/50 bg-white">
        <div className="flex items-stretch">
          <p className="flex shrink-0 items-center border-r border-logo-gold/40 px-4 font-display text-lg italic text-foreground sm:px-5 sm:text-xl">
            Proud caterer for
          </p>
          <div className="client-marquee-window min-w-0 flex-1 overflow-hidden py-2 sm:py-2.5">
            <div className="client-marquee-rtl flex w-max items-center">
              <NameSequence copy="a" />
              <div className="client-marquee-copy flex" aria-hidden>
                <NameSequence copy="b" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
