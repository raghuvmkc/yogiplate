import Image from "next/image";
import Link from "next/link";
import { FeatureFade } from "@/components/FeatureFade";
import { HeroMotion } from "@/components/HeroMotion";
import { DIET_BLURBS, DIET_LABELS, PRIMARY_DIETS } from "@/lib/data/menu-seed";

export default function HomePage() {
  return (
    <div className="bg-white">
      <HeroMotion />

      <section
        id="dietary-paths"
        className="border-t border-line bg-white px-4 py-20 sm:px-6 lg:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
            <div>
              <p className="eyebrow">Dietary paths</p>
              <h2 className="font-display mt-4 text-4xl text-foreground sm:text-5xl lg:text-[3.25rem]">
                Every tradition, one kitchen.
              </h2>
              <p className="lede mt-5 max-w-2xl">
                No celebration is complete without food that is pure — and
                irresistibly delicious. Our kitchen never uses onion, garlic, or
                mushrooms. Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan,
                or Italian — we open only the dishes that belong on your table.
                Pure Vegetarian shows everything. Other paths filter by tradition.
              </p>
            </div>
            <div className="relative mx-auto aspect-square w-64 sm:w-80 lg:w-[22rem]">
              <div
                aria-hidden
                className="absolute -inset-4 rounded-full border border-logo-gold/50"
              />
              <div
                aria-hidden
                className="absolute inset-0 translate-x-4 translate-y-4 rounded-full bg-accent-soft"
              />
              <div className="group relative h-full w-full overflow-hidden rounded-full shadow-[0_24px_60px_-24px_rgba(47,74,58,0.55)] ring-[6px] ring-white">
                <Image
                  src="/images/catering-buffet.jpg"
                  alt="A Yogiplate catering buffet with gold chafing dishes and marigold garlands"
                  fill
                  sizes="(min-width: 1024px) 22rem, (min-width: 640px) 20rem, 16rem"
                  className="object-cover object-[50%_58%] transition duration-700 ease-out group-hover:scale-105"
                />
              </div>
            </div>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {PRIMARY_DIETS.map((diet) => (
              <Link
                key={diet}
                href={`/order?diet=${diet}`}
                className="diet-path group"
              >
                <p className="diet-path-title">{DIET_LABELS[diet]}</p>
                <p className="diet-path-blurb">{DIET_BLURBS[diet]}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-accent-deep opacity-0 transition group-hover:opacity-100">
                  Open this menu →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-warm px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow">Why Yogiplate</p>
            <h2 className="font-display mt-4 text-4xl text-foreground sm:text-5xl lg:text-[3.25rem]">
              Pure ingredients. Fresh every time.
            </h2>
            <p className="lede mt-6">
              Bay Area vegetarians deserve catering that respects faith,
              freshness, and flavor. Our kitchen never uses onion, garlic, or
              mushrooms. We prepare to order, never from tired steam-table
              leftovers — so your guests taste the difference.
            </p>
            <ul className="mt-10 space-y-5 text-base font-medium text-foreground sm:text-lg">
              <li className="flex gap-3.5">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-logo-gold" />
                No onion, garlic, or mushrooms — ever
              </li>
              <li className="flex gap-3.5">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-logo-gold" />
                Online order builder with automatic invoices
              </li>
              <li className="flex gap-3.5">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-logo-gold" />
                Delivery priced by distance across the Bay Area
              </li>
              <li className="flex gap-3.5">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-logo-gold" />
                Coupons and secure Stripe checkout
              </li>
            </ul>
          </div>
          <FeatureFade />
        </div>
      </section>

      <section className="border-t border-line bg-accent-soft/40 px-4 py-20 text-center sm:px-6 lg:py-24">
        <h2 className="font-display text-4xl text-foreground sm:text-5xl lg:text-[3.25rem]">
          Ready to feed your gathering?
        </h2>
        <p className="lede mx-auto mt-5 max-w-xl">
          Choose your diet, build the menu, and checkout in minutes.
        </p>
        <Link
          href="/order"
          className="mt-10 inline-flex bg-accent-deep px-9 py-4 text-base font-semibold text-white transition hover:bg-accent"
        >
          Start your order
        </Link>
      </section>
    </div>
  );
}
