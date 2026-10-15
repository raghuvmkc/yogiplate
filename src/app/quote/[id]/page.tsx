import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getQuoteByToken } from "@/lib/quotes";
import PublicQuoteClient from "./PublicQuoteClient";

/**
 * Server-validate the token so missing/invalid quotes return a real 404
 * (not a soft-404 HTML shell Google treats as "Page not found" content).
 */
export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;
  if (!id || !token) notFound();

  const quote = await getQuoteByToken(id, token);
  if (!quote) notFound();

  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading quote…</p>}>
      <PublicQuoteClient initialQuote={quote} />
    </Suspense>
  );
}
