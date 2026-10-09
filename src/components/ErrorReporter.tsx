"use client";

import { useEffect } from "react";

const MAX_REPORTS_PER_PAGE = 5;
let sent = 0;

export function sendClientError(input: {
  message: string;
  kind: string;
  stack?: string;
  source?: string;
}) {
  if (sent >= MAX_REPORTS_PER_PAGE) return;
  sent += 1;
  const body = JSON.stringify({ ...input, path: window.location.pathname });
  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // reporting must never break the page
  }
}

/** Sends crashes and script errors from customers' browsers to the site monitor. */
export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      sendClientError({
        kind: "error",
        message: event.message || String(event.error || "Unknown error"),
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename,
      });
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      sendClientError({
        kind: "unhandledrejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
