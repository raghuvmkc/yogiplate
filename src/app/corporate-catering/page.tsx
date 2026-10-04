import type { Metadata } from "next";
import Link from "next/link";
import { ClientLogoBand } from "@/components/ClientLogoBand";
import { CorporateInquiryForm } from "@/components/CorporateInquiryForm";

export const metadata: Metadata = {
  title: "Corporate Catering | Yogiplate",
  description:
    "Pure vegetarian corporate catering for Bay Area technology companies — Jain, Swaminarayan, Pushtimarg, Vegan, and Italian menus. Request a consultation.",
};

const occasions = [
  "Team lunches",
  "Office celebrations",
  "Employee events",
  "Client meetings",
  "Business gatherings",
] as const;

const highlights = [
  {
    title: "Fresh for every service",
    body: "We cook catering the same way we cook daily meals — never from leftovers. Each tray is prepared for your event window.",
  },
  {
    title: "Tradition-ready menus",
    body: "Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, and Italian paths — so every teammate can eat with confidence.",
  },
  {
    title: "Office-friendly logistics",
    body: "Delivery across the South Bay and beyond, with clear tray sizing so your ops lead can plan for the room — not guess.",
  },
];

export default function CorporateCateringPage() {
  return (
    <div className="bg-white">
      <section className="border-b border-line bg-warm px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">Corporate catering</p>
          <h1 className="font-display mt-4 max-w-3xl text-5xl text-foreground sm:text-6xl lg:text-7xl">
            Food that belongs in the Bay Area boardroom — and the break room.
          </h1>
          <p className="lede mt-6 max-w-2xl">
            From all-hands lunches to executive offsites, Yogiplate brings pure
            vegetarian hospitality to technology campuses across Silicon Valley.
            We are a proud corporate caterer for Google, LinkedIn, SanDisk,
            Uber, Adobe, Applied Materials, and Illumina — teams that expect
            flavor, freshness, and respect for every dietary tradition at the
            table.
          </p>
          <p className="mt-5 max-w-2xl text-base font-medium text-muted sm:text-lg">
            Minimum catering order is $400.{" "}
            <Link href="/order" className="text-accent-deep underline">
              Build an order online
            </Link>{" "}
            — or send a request below and we will call you for availability.
          </p>
        </div>
      </section>

      <ClientLogoBand />

      <section className="border-b border-line px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">What we cater</p>
          <h2 className="font-display mt-4 text-4xl text-foreground sm:text-5xl">
            Occasions for every team
          </h2>
          <p className="lede mt-5 max-w-2xl">
            Tell us the gathering — we bring the menu, trays, and delivery that
            fit your day.
          </p>
          <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {occasions.map((label) => (
              <li key={label} className="diet-path">
                <p className="diet-path-title text-[1.65rem] sm:text-[1.85rem]">
                  {label}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          <div>
            <p className="eyebrow">Why teams choose us</p>
            <h2 className="font-display mt-4 text-4xl text-foreground sm:text-5xl">
              Built for modern campuses
            </h2>
            <p className="lede mt-5">
              Whether your culture is Jain-friendly, sattvic, fully vegan, or a
              mix of Italian vegetarian favorites and Indian classics, we open
              only the dishes that belong — then deliver them hot, labeled, and
              ready to serve.
            </p>
            <ul className="mt-10 space-y-8">
              {highlights.map((h) => (
                <li key={h.title}>
                  <p className="text-lg font-semibold text-foreground">
                    {h.title}
                  </p>
                  <p className="mt-2 text-base font-medium leading-relaxed text-muted">
                    {h.body}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-12 border-l-2 border-accent pl-5">
              <p className="font-display text-2xl text-foreground sm:text-3xl">
                “Proudly serving the Bay Area tech community — with kitchens
                that honor faith, freshness, and craft.”
              </p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-accent">
                Yogiplate Corporate
              </p>
            </div>
          </div>

          <CorporateInquiryForm />
        </div>
      </section>
    </div>
  );
}
