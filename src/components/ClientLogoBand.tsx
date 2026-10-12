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
          <span className="font-display px-4 text-[1.35rem] font-semibold leading-none tracking-tight text-accent-deep sm:px-6 sm:text-[1.7rem]">
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
      className={
        compact
          ? "shrink-0 bg-white pl-3 pr-40 pt-3 pb-1 sm:pl-5 sm:pr-48"
          : "bg-white py-8 sm:py-10"
      }
      aria-label="Corporate clients"
    >
      <div className="overflow-x-hidden border-y border-logo-gold/50 bg-white">
        <div className="flex min-h-[3.5rem] items-center sm:min-h-[3.75rem]">
          <p className="flex shrink-0 items-center self-stretch border-r border-logo-gold/40 px-4 font-display text-lg italic leading-snug text-foreground sm:px-5 sm:text-xl">
            Proud caterer for
          </p>
          <div className="client-marquee-window min-w-0 flex-1 overflow-x-hidden overflow-y-visible py-3 sm:py-3.5">
            {/* Horizontal fades — safe on iOS (no CSS mask) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent sm:w-10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:w-10"
            />
            <div className="client-marquee-rtl flex w-max items-center leading-none">
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
