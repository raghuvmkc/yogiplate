import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@netlify/blobs"],
  turbopack: {},
  webpack: (config, { dev }) => {
    if (!dev) {
      // Avoid writing .next/cache/webpack/*.pack, which Netlify's secret scan reads.
      config.cache = false;
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828],
    qualities: [75, 90, 100],
  },
};

export default nextConfig;
