import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  description:
    "That page is not on Yogiplate. Build an order or contact us for Bay Area vegetarian catering.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function NotFound() {
  return (
    <div className="bg-white px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-xl text-center">
        <p className="eyebrow">404</p>
        <h1 className="font-display mt-4 text-5xl text-foreground">Page not found</h1>
        <p className="lede mt-5">
          That link may be old. You can build a catering order or reach us from the contact page.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/order"
            className="bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white"
          >
            Build your order
          </Link>
          <Link
            href="/contact"
            className="border border-line px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
