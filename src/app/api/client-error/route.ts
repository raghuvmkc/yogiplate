import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitor";

export const runtime = "nodejs";

/** Noise from browser extensions, in-app browsers, and harmless quirks; not our bugs. */
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Load failed$/i,
  /NetworkError when attempting to fetch/i,
  /Failed to fetch$/i,
  /AbortError/i,
  // Android / Facebook / Instagram in-app WebViews inject iabjs bridges that
  // throw when the native side is torn down on navigation or close.
  /iabjs:/i,
  /navigation_performance_logger_android/i,
  /Java object is gone/i,
  /Error invoking postMessage/i,
  /cecurrentvideometricspassword/i,
];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    message?: unknown;
    source?: unknown;
    path?: unknown;
    stack?: unknown;
    kind?: unknown;
  } | null;
  const message = String(body?.message || "").slice(0, 400);
  const source = String(body?.source || "");
  const stack = String(body?.stack || "");
  const haystack = `${message}\n${source}\n${stack}`;
  if (!message || IGNORE.some((re) => re.test(haystack))) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  await reportError("browser", message, {
    kind: String(body?.kind || "error").slice(0, 40),
    path: String(body?.path || "").slice(0, 200),
    source: source.slice(0, 200),
    stack: stack.split("\n").slice(0, 4).join(" | ").slice(0, 600),
    browser: (req.headers.get("user-agent") || "").slice(0, 160),
  });
  return NextResponse.json({ ok: true });
}
