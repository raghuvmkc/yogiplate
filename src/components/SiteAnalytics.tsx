"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";

/** GA4 on public pages only — skip the admin desk. */
export function SiteAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  if (!gaId || pathname?.startsWith("/admin")) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
