import type { Quote } from "@/lib/types";

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function publicQuoteUrl(quote: Pick<Quote, "id" | "public_token">) {
  return `${siteUrl()}/quote/${quote.id}?t=${quote.public_token}`;
}
