"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sendClientError } from "@/components/ErrorReporter";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    sendClientError({
      kind: "page-crash",
      message: error.digest ? `${error.message} (digest ${error.digest})` : error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="eyebrow">Sorry</p>
      <h1 className="font-display mt-4 text-4xl text-foreground">Something went wrong</h1>
      <p className="mt-4 text-muted">
        This page hit a problem. We have been notified. Your cart is saved, so you can
        try again.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="bg-accent-deep px-5 py-3 text-sm font-semibold text-white hover:bg-accent"
        >
          Try again
        </button>
        <Link href="/" className="border border-line px-5 py-3 text-sm font-semibold">
          Go to home page
        </Link>
      </div>
    </div>
  );
}
