import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { ChatWidget } from "@/components/ChatWidget";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      </body>
    </html>
  );
}
