import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Payment",
  description: "Yogiplate invoice payment status.",
  path: "/pay/status",
  noIndex: true,
});

export default async function PayStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason = String(params.reason || "");

  let title = "Payment link";
  let body = "This payment link is not available. Please contact Yogiplate if you need help.";
  if (reason === "paid") {
    title = "Already paid";
    body = "Thank you — this invoice is paid in full. Nothing more is due on this link.";
  } else if (reason === "cancelled") {
    title = "Invoice closed";
    body = "This invoice was cancelled, so it cannot be paid. Please contact us if you still need catering.";
  } else if (reason === "invalid") {
    title = "Link not valid";
    body = "This payment link is incomplete or outdated. Ask Yogiplate to send a fresh invoice email.";
  } else if (reason === "unavailable") {
    title = "Payment unavailable";
    body = "Card payment is temporarily unavailable. Please call (408) 335-4055 and we will help.";
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Yogiplate</p>
      <h1
        className="mt-4 text-4xl tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {title}
      </h1>
      <p className="mt-4 text-base text-muted">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="bg-accent-deep px-5 py-2.5 text-sm font-semibold text-white">
          Home
        </Link>
        <Link href="/contact" className="border border-line px-5 py-2.5 text-sm font-semibold">
          Contact us
        </Link>
      </div>
    </div>
  );
}
