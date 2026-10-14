import type { Quote } from "@/lib/types";

const PRODUCTION_SITE = "https://www.yogiplate.com";

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isNetlifyAppHost(url: string) {
  const host = hostOf(url);
  return Boolean(host && host.endsWith(".netlify.app"));
}

/**
 * Public site origin for emails, Stripe, sitemap, and canonical SEO URLs.
 * Never publish *.netlify.app as the customer-facing host — Google and Stripe
 * should see www.yogiplate.com.
 */
export function siteUrl() {
  const candidates = [
    (process.env.NEXT_PUBLIC_SITE_URL || "").trim(),
    (process.env.URL || "").trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!isNetlifyAppHost(candidate)) {
      return stripTrailingSlash(candidate);
    }
  }

  // Local next dev (no Netlify CONTEXT) keeps localhost; everything else uses the real domain.
  if (!process.env.CONTEXT && process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return PRODUCTION_SITE;
}

export function publicQuoteUrl(quote: Pick<Quote, "id" | "public_token">) {
  return `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
}
