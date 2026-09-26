"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/lib/cart-store";

const links = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/order", label: "Build order", short: "Order" },
  { href: "/corporate-catering", label: "Corporate", short: "Corporate" },
  { href: "/about-the-chef", label: "About the chef", short: "Chef" },
];

export function Header() {
  const pathname = usePathname();
  const itemCount = useCartStore((s) =>
    s.items.reduce((n, i) => n + i.quantity, 0)
  );
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-40 overflow-visible border-b border-line/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1700px] items-center justify-between gap-2 overflow-visible px-3 sm:h-28 sm:gap-3 sm:px-6 lg:h-32">
        <Link href="/" className="flex min-w-0 items-center">
          <Image
            src="/images/Yogiplate_Logo_transparent.png"
            alt="Yogiplate"
            width={140}
            height={140}
            unoptimized
            className="h-11 w-11 shrink-0 object-contain mix-blend-multiply sm:h-24 sm:w-24 lg:h-28 lg:w-28"
            priority
          />
        </Link>
        <nav className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-2 lg:gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-1.5 py-1.5 text-sm font-bold transition-colors sm:px-3 sm:py-2 sm:text-lg lg:text-xl ${
                pathname === l.href
                  ? "text-logo-gold-deep"
                  : "text-accent-deep hover:text-logo-gold"
              }`}
            >
              <span className="sm:hidden">{l.short}</span>
              <span className="hidden sm:inline">{l.label}</span>
              {l.href === "/order" && itemCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-logo-gold px-1.5 text-[11px] text-white">
                  {itemCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
