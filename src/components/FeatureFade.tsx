"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const IMAGES = [
  {
    src: "/images/home-feature-1.png",
    alt: "Malpua with rabri from Yogiplate",
  },
  {
    src: "/images/home-feature-2.png",
    alt: "Bhindi aloo from Yogiplate",
  },
  {
    src: "/images/home-feature-3.png",
    alt: "Sweet pongal from Yogiplate",
  },
] as const;

const INTERVAL_MS = 4200;

export function FeatureFade() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % IMAGES.length),
      INTERVAL_MS
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const next = IMAGES[(index + 1) % IMAGES.length];
    const img = new window.Image();
    img.src = next.src;
  }, [index]);

  return (
    <div className="soft-media relative mx-auto aspect-square w-full max-w-md overflow-hidden lg:max-w-none">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={IMAGES[index].src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <Image
            src={IMAGES[index].src}
            alt={IMAGES[index].alt}
            fill
            sizes="(max-width: 1024px) 90vw, 28rem"
            className="object-cover object-center"
            priority={index === 0}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
