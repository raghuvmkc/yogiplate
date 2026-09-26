import Link from "next/link";
import { StripeSuccess } from "@/components/StripeSuccess";

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    order?: string;
    invoice?: string;
    session_id?: string;
  }>;
}) {
  const params = await searchParams;

  if (params.session_id) {
    return (
      <div className="bg-white">
        <StripeSuccess sessionId={params.session_id} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
        Confirmed
      </p>
      <h1
        className="mt-4 text-5xl tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Thank you
      </h1>
      <p className="mt-4 text-muted">
        Your catering order is paid and saved. An invoice has been generated
        {params.invoice ? ` (${params.invoice})` : ""} and emailed when Resend
        is configured.
      </p>
      {params.order ? (
        <p className="mt-6 text-sm font-medium text-foreground">
          Order number: {params.order}
        </p>
      ) : null}
      <Link
        href="/"
        className="mt-10 inline-flex bg-accent-deep px-6 py-3 text-sm font-semibold text-white"
      >
        Back home
      </Link>
    </div>
  );
}
