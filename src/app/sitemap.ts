import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }[] =
    [
      { path: "/", changeFrequency: "weekly", priority: 1 },
      { path: "/order", changeFrequency: "weekly", priority: 0.95 },
      { path: "/corporate-catering", changeFrequency: "monthly", priority: 0.9 },
      { path: "/about-the-chef", changeFrequency: "monthly", priority: 0.8 },
      { path: "/contact", changeFrequency: "monthly", priority: 0.85 },
      { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    ];

  return pages.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
