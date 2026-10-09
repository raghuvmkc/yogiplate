import type { Instrumentation } from "next";

/** Any server error the route code did not catch itself goes to the site monitor. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitor");
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  await reportError("server", err, {
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    type: context.routeType,
    digest,
  });
};
