import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ChatWidget } from "@/components/ChatWidget";
import { ErrorReporter } from "@/components/ErrorReporter";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SiteAnalytics } from "@/components/SiteAnalytics";
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
  title: "Yogiplate Catering | Bay Area Indian Vegetarian",
  description:
    "Build online catering orders for Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, and Italian menus across the Bay Area. Pure, fresh ingredients.",
  openGraph: {
    title: "Yogiplate Catering",
    description:
      "Bay Area vegetarian catering you can order online — Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan & Italian.",
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
