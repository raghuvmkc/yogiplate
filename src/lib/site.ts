import type { Quote } from "@/lib/types";

const PRODUCTION_SITE = "https://www.yogiplate.com";

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isNetlifyAppHost(url: string) {
  const host = hostOf(url);
  return Boolean(host && host.endsWith(".netlify.app"));
}

/** Collapse apex / www / netlify hosts to the canonical customer URL. */
function canonicalizePublicOrigin(url: string) {
  const host = hostOf(url);
  if (!host) return "";
  if (host === "yogiplate.com" || host === "www.yogiplate.com" || host.endsWith(".netlify.app")) {
    return PRODUCTION_SITE;
  }
  return stripTrailingSlash(url);
}

/**
 * Public site origin for emails, Stripe, sitemap, and canonical SEO URLs.
 * Always prefer https://www.yogiplate.com in production.
 */
export function siteUrl() {
  const candidates = [
    (process.env.NEXT_PUBLIC_SITE_URL || "").trim(),
    (process.env.URL || "").trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isNetlifyAppHost(candidate)) continue;
    const canonical = canonicalizePublicOrigin(candidate);
    if (canonical) return canonical;
  }

  if (!process.env.CONTEXT && process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return PRODUCTION_SITE;
}

export function publicQuoteUrl(quote: Pick<Quote, "id" | "public_token">) {
  return `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
}
