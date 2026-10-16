import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * This app has no Server Actions. A POST carrying `Next-Action` (scanners or a
 * stale client) makes Next.js 16 answer `text/plain`, then throw
 * "Expected RSC response, got text/plain" as a 500 on the page.
 * Answer 404 here so the page renderer never sees that request.
 */
export function proxy(request: NextRequest) {
  if (request.method === "POST" && request.headers.has("next-action")) {
    return new NextResponse("Server action not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-nextjs-action-not-found": "1",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
