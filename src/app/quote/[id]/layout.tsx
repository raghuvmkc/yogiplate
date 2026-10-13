import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Your Quotation",
  description: "Private Yogiplate catering quotation.",
  path: "/quote",
  noIndex: true,
});

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
