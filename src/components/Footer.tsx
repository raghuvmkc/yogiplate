"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-line bg-warm">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-3xl font-semibold text-foreground">
            Yogiplate
          </p>
          <p className="mt-3 max-w-xs text-base font-medium leading-relaxed text-muted">
            Pure vegetarian catering for the Bay Area — Jain, Swaminarayan,
            Pushtimarg, Pure Vegetarian, Vegan, and Italian. No onion, garlic,
            or mushrooms in our kitchen.
          </p>
        </div>
        <div>
          <p className="text-base font-bold text-foreground">Explore</p>
          <ul className="mt-4 space-y-2.5 text-base font-medium text-muted">
            <li>
              <Link href="/order" className="hover:text-accent-deep">
                Build your order
              </Link>
            </li>
            <li>
              <Link href="/corporate-catering" className="hover:text-accent-deep">
                Corporate catering
              </Link>
            </li>
            <li>
              <Link href="/about-the-chef" className="hover:text-accent-deep">
                About the chef
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-accent-deep">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/admin" className="hover:text-accent-deep">
                Admin
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-base font-bold text-foreground">Service area</p>
          <p className="mt-4 text-base font-medium leading-relaxed text-muted">
            326 Commercial St, San Jose, CA 95112
            <br />
            Delivery within 25 miles
            <br />
            orders@yogiplate.com
          </p>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-sm font-medium text-muted">
        © {new Date().getFullYear()} Yogiplate Catering. All vegetarian. Always
        fresh. ·{" "}
        <Link href="/privacy" className="hover:text-accent-deep">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
