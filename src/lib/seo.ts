import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

/** Canonical public business facts for metadata + JSON-LD (match the footer NAP). */
export const SITE_NAME = "Yogiplate Catering";
export const SITE_TAGLINE = "Bay Area pure vegetarian catering";
export const DEFAULT_DESCRIPTION =
  "Pure vegetarian catering in the Bay Area — Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, and Italian menus. No onion, garlic, or mushrooms. Order online.";

export const BUSINESS = {
  name: SITE_NAME,
  legalName: "Yogiplate Catering",
  email: "support@yogiplate.com",
  phoneDisplay: "(408) 335-4055",
  phoneE164: "+14083354055",
  streetAddress: "326 Commercial St",
  addressLocality: "San Jose",
  addressRegion: "CA",
  postalCode: "95112",
  addressCountry: "US",
  areaServed: "San Francisco Bay Area",
  deliveryRadiusMiles: 25,
  priceRange: "$$",
  cuisine: "Indian Vegetarian",
} as const;

export const OG_IMAGE_PATH = "/images/catering-buffet.jpg";

export function absoluteUrl(path = "/") {
  const base = siteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Per-page metadata that inherits the root title template (`%s | Yogiplate Catering`). */
export function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  ogImage?: string;
}): Metadata {
  const url = absoluteUrl(input.path);
  const fullTitle = `${input.title} | ${SITE_NAME}`;
  const image = absoluteUrl(input.ogImage || OG_IMAGE_PATH);
  // noIndex pages must not claim another URL's canonical (e.g. 404 → homepage).
  return {
    title: input.title,
    description: input.description,
    ...(input.noIndex
      ? {
          robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
        }
      : {
          alternates: { canonical: url },
          robots: { index: true, follow: true },
          openGraph: {
            type: "website",
            locale: "en_US",
            url,
            siteName: SITE_NAME,
            title: fullTitle,
            description: input.description,
            images: [{ url: image, width: 1200, height: 630, alt: SITE_NAME }],
          },
          twitter: {
            card: "summary_large_image",
            title: fullTitle,
            description: input.description,
            images: [image],
          },
        }),
  };
}

/** LocalBusiness + FoodEstablishment JSON-LD for Google. */
export function localBusinessJsonLd() {
  const url = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": ["FoodEstablishment", "LocalBusiness"],
    "@id": `${url}/#business`,
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    description: DEFAULT_DESCRIPTION,
    url,
    image: absoluteUrl(OG_IMAGE_PATH),
    logo: absoluteUrl("/images/Yogiplate_Logo.png"),
    email: BUSINESS.email,
    telephone: BUSINESS.phoneE164,
    priceRange: BUSINESS.priceRange,
    servesCuisine: BUSINESS.cuisine,
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS.streetAddress,
      addressLocality: BUSINESS.addressLocality,
      addressRegion: BUSINESS.addressRegion,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.addressCountry,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 37.3382,
      longitude: -121.8863,
    },
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: {
        "@type": "GeoCoordinates",
        latitude: 37.3382,
        longitude: -121.8863,
      },
      geoRadius: `${BUSINESS.deliveryRadiusMiles * 1609.34}`,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "10:30",
        closes: "21:00",
      },
    ],
    hasMenu: absoluteUrl("/order"),
    acceptsReservations: false,
    foundingDate: "2024",
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}/#website`,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": `${absoluteUrl("/")}/#business` },
    potentialAction: {
      "@type": "OrderAction",
      target: absoluteUrl("/order"),
    },
  };
}

export function personJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Radhavallabh",
    alternateName: "Radhavallabha Das",
    jobTitle: "Chef and Founder",
    worksFor: { "@id": `${absoluteUrl("/")}/#business` },
    url: absoluteUrl("/about-the-chef"),
    image: absoluteUrl("/images/rvp-portrait.jpg"),
    description:
      "IIT Bombay graduate, monk, author, and Chef and Founder of Yogiplate — sattvik pure vegetarian catering in the Bay Area.",
  };
}
