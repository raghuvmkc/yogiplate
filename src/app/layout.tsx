import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ChatWidget } from "@/components/ChatWidget";
import { ErrorReporter } from "@/components/ErrorReporter";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  localBusinessJsonLd,
  OG_IMAGE_PATH,
  SITE_NAME,
  websiteJsonLd,
} from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-YK5B9QRH2S";

// Self-hosted (Latin variable fonts from Google Fonts) so builds never depend on fetching Google.
const display = localFont({
  src: "./fonts/cormorant-garamond-latin.woff2",
  variable: "--font-display",
  weight: "400 700",
  display: "swap",
});

const sans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-sans",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} | Bay Area Indian Vegetarian`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Bay Area vegetarian catering",
    "Indian vegetarian catering San Jose",
    "Jain catering",
    "Swaminarayan catering",
    "Pushtimarg catering",
    "vegan catering Bay Area",
    "pure vegetarian catering",
    "corporate vegetarian catering",
    "Yogiplate",
  ],
  authors: [{ name: "Radhavallabh", url: absoluteUrl("/about-the-chef") }],
  creator: "Yogiplate",
  publisher: SITE_NAME,
  formatDetection: { telephone: true, email: true, address: true },
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Bay Area Indian Vegetarian`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Yogiplate pure vegetarian catering buffet",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Bay Area Indian Vegetarian`,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-white text-foreground antialiased font-medium">
        <JsonLd data={[localBusinessJsonLd(), websiteJsonLd()]} />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <ChatWidget />
        <ErrorReporter />
        <SiteAnalytics gaId={GA_MEASUREMENT_ID} />
      </body>
    </html>
  );
}
