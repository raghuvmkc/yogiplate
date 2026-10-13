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

/** Public site origin for emails, Stripe, sitemap, and canonical SEO URLs. */
export function siteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicit) return stripTrailingSlash(explicit);

  // Netlify sets URL to *.netlify.app even when a custom domain is attached.
  // Prefer the production domain so Google gets the right sitemap/canonicals.
  const netlifyUrl = (process.env.URL || "").trim();
  const host = hostOf(netlifyUrl);
  if (host && !host.endsWith(".netlify.app")) {
    return stripTrailingSlash(netlifyUrl);
  }
  if (
    process.env.CONTEXT === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return PRODUCTION_SITE;
  }
  return stripTrailingSlash(netlifyUrl || "http://localhost:3000");
}

export function publicQuoteUrl(quote: Pick<Quote, "id" | "public_token">) {
  return `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
}
