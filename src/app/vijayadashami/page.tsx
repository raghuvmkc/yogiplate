import type { Metadata } from "next";
import { DashamiOrder } from "@/components/DashamiOrder";
import { dashamiOrdersOpen } from "@/lib/dashami-offer";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Vijaya Dashami family lunch",
  description:
    "Pre-order Chef Radhavallabh’s Vijaya Dashami family lunch. $79 for two adults and two kids, with free delivery within 15 miles. Orders close October 19 at 8:00 PM Pacific.",
  path: "/vijayadashami",
  ogImage: "/images/vijayadashami-lunch.jpg",
});

export const dynamic = "force-dynamic";

export default function VijayaDashamiPage() {
  return <DashamiOrder open={dashamiOrdersOpen()} />;
}
