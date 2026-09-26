"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const REVIEWS = [
  { src: "/images/Review1.png", w: 1630, h: 647 },
  { src: "/images/Review2.png", w: 1672, h: 730 },
  { src: "/images/Review3.png", w: 1600, h: 485 },
  { src: "/images/Review4.png", w: 1682, h: 585 },
  { src: "/images/Review5.png", w: 1720, h: 497 },
  { src: "/images/Review6.png", w: 1700, h: 605 },
  { src: "/images/Review7.png", w: 1690, h: 612 },
  { src: "/images/Review8.png", w: 1665, h: 532 },
];

const QUOTES = [
  "Food made in purity carries a flavor no shortcut can imitate.",
  "We believe what enters the body shapes the mind and soul — so we cook only what is pure, fresh, and true.",
  "Some cook to fill the stomach. We cook to honor it. That is the difference you taste.",
  "One unforgettable bite does what a thousand invitations cannot — it makes them wait for your next celebration.",
];

const REVIEW_INTERVAL_MS = 5500;
const QUOTE_INTERVAL_MS = 6500;
const BRAND_INTERVAL_MS = 4500;

const BRAND_IMAGES = [
  {
    src: "/images/Yogiplate_Logo_transparent.png",
    alt: "Yogiplate logo",
    contain: true,
  },
  {
    src: "/images/Poorimaking.png",
    alt: "Making fresh poori at Yogiplate",
  },
  {
    src: "/images/palakpaneer.png",
    alt: "Palak paneer from Yogiplate",
  },
  {
    src: "/images/northindianthali_1.png",
    alt: "North Indian thali from Yogiplate",
  },
  {
    src: "/images/noodles.png",
    alt: "Noodles from Yogiplate",
  },
  {
    src: "/images/paneerbiryani.png",
    alt: "Paneer biryani from Yogiplate",
  },
  {
    src: "/images/pizza1.png",
    alt: "Vegetarian pizza from Yogiplate",
  },
  {
    src: "/images/pizza2.png",
    alt: "Fresh pizza from Yogiplate",
  },
];

export function HeroMotion() {
  const [index, setIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [brandIndex, setBrandIndex] = useState(0);
  const current = REVIEWS[index];
  const brand = BRAND_IMAGES[brandIndex];

  useEffect(() => {
    const tick = () => setIndex((i) => (i + 1) % REVIEWS.length);
    const id = window.setInterval(tick, REVIEW_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => setQuoteIndex((i) => (i + 1) % QUOTES.length);
    const id = window.setInterval(tick, QUOTE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () => setBrandIndex((i) => (i + 1) % BRAND_IMAGES.length);
    const id = window.setInterval(tick, BRAND_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Keep the next frames warm so mobile/tunnel loads don't stall the carousel.
  useEffect(() => {
    const nextBrand = BRAND_IMAGES[(brandIndex + 1) % BRAND_IMAGES.length];
    const nextReview = REVIEWS[(index + 1) % REVIEWS.length];
    [nextBrand.src, nextReview.src].forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, [brandIndex, index]);

  return (
    <section className="relative overflow-hidden bg-white">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col px-3 py-4 sm:px-5 sm:py-5 lg:h-[calc(100svh-8rem)] lg:px-6 lg:py-3">
        <div className="mx-auto w-full max-w-5xl shrink-0 px-1">
          <div className="relative flex min-h-[5.5rem] items-center justify-center sm:min-h-[5.25rem] lg:min-h-[5.75rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={quoteIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 text-center"
              >
                <p className="font-display text-[clamp(1.15rem,4.2vw,1.9rem)] font-semibold italic leading-snug tracking-wide text-accent-deep">
                  “{QUOTES[quoteIndex]}”
                </p>
                <p className="mt-2 text-sm font-semibold tracking-wide text-accent-deep sm:text-lg">
                  — Radhavallabh (Chef and Founder)
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 items-stretch gap-5 sm:mt-3 lg:grid-cols-[0.78fr_1.22fr] lg:grid-rows-1 lg:gap-6 xl:gap-8">
          {/* Brand / food carousel — explicit size on mobile so frames actually swap */}
          <div className="relative z-10 flex min-h-0 min-w-0 w-full items-center justify-center overflow-hidden bg-white">
            <div
              className={`relative aspect-square w-full max-w-[min(100%,420px)] overflow-hidden lg:h-full lg:max-h-full lg:w-auto lg:max-w-full ${
                brand.contain ? "" : "soft-media"
              }`}
            >
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={brand.src}
                  className="absolute inset-0 overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Image
                    src={brand.src}
                    alt={brand.alt}
                    fill
                    priority={brandIndex === 0}
                    unoptimized
                    className={
                      brand.contain
                        ? "object-contain object-center p-4 mix-blend-multiply"
                        : "object-cover object-center"
                    }
                    sizes="(max-width: 1024px) 90vw, 40vw"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="relative z-0 flex min-h-0 min-w-0 w-full flex-col overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-white">
              <div className="soft-media-wide relative aspect-[4/3] w-full max-w-full overflow-hidden sm:aspect-[2/1] lg:aspect-[3/1] lg:max-h-full">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current.src}
                    className="absolute inset-0 overflow-hidden bg-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Image
                      src={current.src}
                      alt={`Google review ${index + 1}`}
                      fill
                      unoptimized
                      quality={100}
                      className="object-contain object-center"
                      sizes="(max-width: 1024px) 100vw, 55vw"
                      priority={index === 0}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
