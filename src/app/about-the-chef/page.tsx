import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About the Chef | Yogiplate",
  description:
    "Meet Radhavallabh — IIT Bombay graduate, monk, author, and Chef and Founder of Yogiplate. Sattvik food for mind, body, and soul.",
};

const CHEF_PHOTOS = [
  {
    src: "/images/rvp1.jpg",
    alt: "Radhavallabh, Chef and Founder of Yogiplate",
    w: 427,
    h: 636,
  },
  {
    src: "/images/rvp2.jpg",
    alt: "Radhavallabh teaching and sharing about healthy living",
    w: 768,
    h: 1024,
  },
  {
    src: "/images/rvp3.jpg",
    alt: "Radhavallabh at a seminar on sattvik living",
    w: 960,
    h: 960,
  },
  {
    src: "/images/rvp4.jpg",
    alt: "Radhavallabh, Chef and Founder",
    w: 516,
    h: 842,
  },
  {
    src: "/images/rvp-portrait.jpg",
    alt: "Portrait of Radhavallabh, Chef and Founder of Yogiplate",
    w: 900,
    h: 1200,
  },
] as const;

export default function AboutTheChefPage() {
  return (
    <div className="bg-white">
      {/* Intro */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-20">
        <div>
          <p className="eyebrow">About the chef</p>
          <h1 className="font-display mt-4 text-5xl text-foreground sm:text-6xl lg:text-7xl">
            Radhavallabh
          </h1>
          <p className="mt-3 text-xl font-semibold text-accent-deep">
            Chef and Founder
          </p>
          <p className="lede mt-6 max-w-xl">
            An IIT Bombay graduate who became a monk — and then a chef — with one
            clear purpose: serve food that tastes wonderful and nourishes mind,
            body, and soul.
          </p>
        </div>

        <div className="soft-media relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none">
          <Image
            src={CHEF_PHOTOS[4].src}
            alt={CHEF_PHOTOS[4].alt}
            fill
            priority
            className="object-cover object-top"
            sizes="(max-width: 1024px) 90vw, 45vw"
          />
        </div>
      </section>

      {/* Journey */}
      <section className="border-t border-line bg-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-16">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="soft-media relative col-span-2 aspect-[4/5] sm:aspect-[5/4]">
              <Image
                src={CHEF_PHOTOS[0].src}
                alt={CHEF_PHOTOS[0].alt}
                fill
                className="object-cover object-top"
                sizes="(max-width: 1024px) 90vw, 40vw"
              />
            </div>
            <div className="soft-media relative aspect-[3/4]">
              <Image
                src={CHEF_PHOTOS[1].src}
                alt={CHEF_PHOTOS[1].alt}
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 45vw, 20vw"
              />
            </div>
            <div className="soft-media relative aspect-[3/4]">
              <Image
                src={CHEF_PHOTOS[3].src}
                alt={CHEF_PHOTOS[3].alt}
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 45vw, 20vw"
              />
            </div>
          </div>

          <div>
            <p className="eyebrow">The journey</p>
            <h2 className="font-display mt-4 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              From IIT Bombay to the kitchen
            </h2>
            <div className="mt-7 space-y-5 text-lg font-medium leading-relaxed text-muted sm:text-xl">
              <p>
                Radhavallabh’s path is unusual — and that is exactly what
                shaped Yogiplate. After graduating from IIT Bombay, he chose the
                life of a monk: years of yoga, mindfulness, and clean, sattvik
                eating, where every ingredient is chosen with care and nothing
                impure ever touches the pot.
              </p>
              <p>
                That practice became a calling. He stepped into the kitchen to
                prove that healthy food never has to mean boring food — and that
                taste and wellbeing can share the same plate.
              </p>
              <p>
                Across the USA and India, he has led seminars on healthy living
                without compromising on flavor, inviting people to eat in a way
                that satisfies not only hunger, but clarity of mind and quiet of
                spirit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Book */}
      <section className="border-t border-line bg-warm px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <a
            href="https://www.amazon.com/dp/0143454536"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative mx-auto block w-full max-w-sm transition duration-500 ease-out hover:-translate-y-1.5 lg:max-w-md"
            aria-label="Order yogiplate: The Fundamentals of Sāttvic Food on Amazon"
          >
            <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(196,160,53,0.18),transparent_70%)] opacity-80 transition duration-500 group-hover:opacity-100" />
            <div className="soft-media relative aspect-[4/5] w-full overflow-hidden bg-[#f3efe6]">
              <Image
                src="/images/Yogiplate_book.jpg"
                alt="yogiplate: The Fundamentals of Sāttvic Food by Radhavallabha Das — Penguin Random House"
                fill
                className="object-cover object-center transition duration-700 ease-out group-hover:scale-[1.03]"
                sizes="(max-width: 1024px) 80vw, 36vw"
              />
            </div>
          </a>

          <div>
            <p className="eyebrow">The book</p>
            <h2 className="font-display mt-4 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              The Fundamentals of Sāttvic Food
            </h2>
            <p className="mt-3 text-base font-semibold tracking-wide text-accent-deep">
              By Radhavallabha Das · Penguin Random House
            </p>
            <div className="mt-7 space-y-5 text-lg font-medium leading-relaxed text-muted sm:text-xl">
              <p>
                In this book, Radhavallabh shares a practical path to eating
                well: how to recognize your unique body type, and which
                vegetables, fruits, grains, and spices will suit you best.
              </p>
              <p>
                More than a cookbook, it is a guide to sattvik nourishment —
                food that strengthens the body, steadies the mind, and gently
                feeds the inner soul.
              </p>
            </div>
            <a
              href="https://www.amazon.com/dp/0143454536"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-3 bg-accent-deep px-8 py-4 text-base font-semibold text-white transition hover:bg-accent"
            >
              <span>Order on Amazon</span>
              <span aria-hidden className="text-logo-gold">
                →
              </span>
            </a>
            <p className="mt-3 text-sm font-medium text-muted">
              Available worldwide via Amazon
            </p>
          </div>
        </div>
      </section>

      {/* Why Yogiplate */}
      <section className="border-t border-line bg-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <p className="eyebrow">Why Yogiplate</p>
            <h2 className="font-display mt-4 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              Born from one simple question
            </h2>
            <div className="mt-7 space-y-5 text-lg font-medium leading-relaxed text-muted sm:text-xl">
              <p>
                Why should anyone choose between food that tastes wonderful and
                food that treats the body well?
              </p>
              <p>
                Looking around the Bay Area, Radhavallabh saw families settling
                for heavy, shortcut-laden catering because “healthy” always
                seemed to mean “boring.” Yogiplate was founded to prove
                otherwise — with fresh ingredients, time-honored recipes, and
                the calm attention of a daily practice.
              </p>
              <p>
                Today the kitchen serves everyone: tech offices and birthday
                parties, weddings and weeknight gatherings, lifelong vegetarians
                and curious foodies alike. You don’t need to follow any tradition
                to taste the difference care makes — you just need one bite.
              </p>
              <p className="text-lg font-semibold text-accent-deep sm:text-xl">
                Pure enough to trust. Delicious enough to celebrate. Food the
                way it was always meant to be.
              </p>
            </div>
          </div>

          <div className="soft-media relative mx-auto aspect-square w-full max-w-md lg:max-w-none">
            <Image
              src={CHEF_PHOTOS[2].src}
              alt={CHEF_PHOTOS[2].alt}
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 90vw, 40vw"
            />
          </div>
        </div>
      </section>

      {/* Photo strip — all five */}
      <section className="border-t border-line bg-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">In moments</p>
          <h2 className="font-display mt-4 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            The chef behind the plate
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
            {CHEF_PHOTOS.map((photo, i) => (
              <div
                key={photo.src}
                className={`soft-media relative aspect-[3/4] ${
                  i === 2 ? "col-span-2 md:col-span-1" : ""
                }`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 768px) 45vw, 18vw"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="border-t border-line bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p
            className="font-display text-[clamp(1.4rem,3vw,2.1rem)] font-semibold italic leading-snug text-accent-deep"
          >
            “We believe what enters the body shapes the mind and soul — so we
            cook only what is pure, fresh, and true.”
          </p>
          <p className="mt-5 text-base font-semibold tracking-wide text-accent-deep sm:text-lg">
            — Radhavallabh (Chef and Founder)
          </p>
        </div>
      </section>
    </div>
  );
}
