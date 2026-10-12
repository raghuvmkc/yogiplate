import type { Metadata } from "next";
import { ContactMessageForm } from "@/components/ContactMessageForm";
import { TalkToAiYogiButton } from "@/components/TalkToAiYogiButton";
import { MANAGER_HOURS_LABEL } from "@/lib/manager-hours";
import { getYogiPeople, managerFormalName } from "@/lib/people";

const SUPPORT_EMAIL = "support@yogiplate.com";

export const metadata: Metadata = {
  title: "Contact Us | Yogiplate",
  description:
    "Talk to Yogiplate about your catering: chat or speak with our AI Yogi agent any time, email support@yogiplate.com, or call our manager directly at (408) 335-4055.",
};

export default function ContactPage() {
  const people = getYogiPeople();
  const manager = managerFormalName(people);
  const phoneDisplay = people.managerPhoneDisplay;
  const phoneTel = people.managerPhoneTel;

  return (
    <div className="bg-white">
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="eyebrow">Contact us</p>
        <h1 className="font-display mt-4 text-5xl text-foreground sm:text-6xl">
          We&apos;d love to hear from you
        </h1>
        <p className="lede mt-6 max-w-2xl">
          Planning an event or have a question about our menu? Talk to us the way that suits you:
          through our AI Yogi agent, by email, or by calling our manager directly.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="border border-line bg-warm px-6 py-7">
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">Talk to AI Yogi</h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Our AI Yogi agent is available any time. Type or speak with your mic to plan your
              menu, check dietary needs, and get a quote for your event.
            </p>
            <TalkToAiYogiButton />
          </div>

          <div className="border border-line bg-warm px-6 py-7">
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">Email us</h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Prefer email? Write to our support inbox and we&apos;ll get back to you about menus,
              quotes, and catering details.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-6 inline-flex bg-accent-deep px-7 py-3 text-base font-semibold text-white transition hover:bg-accent"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          <div className="border border-line bg-warm px-6 py-7">
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">Call our Manager</h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Prefer a person? Call {manager}, our {people.managerTitle.toLowerCase() || "manager"},
              directly. If he can&apos;t pick up, he&apos;ll call you back as soon as he&apos;s
              available.
            </p>
            <p className="mt-4 text-sm font-semibold leading-snug text-accent-deep">
              Available {MANAGER_HOURS_LABEL}, Tuesday–Sunday
            </p>
            <p className="mt-1.5 text-sm font-medium text-muted">
              Closed Mondays. Outside these hours, chat with AI Yogi for menus and quotes —{" "}
              {manager} will follow up afterwards.
            </p>
            <a
              href={`tel:${phoneTel}`}
              className="mt-6 inline-flex bg-accent-deep px-7 py-3 text-base font-semibold text-white transition hover:bg-accent"
            >
              Call {phoneDisplay}
            </a>
          </div>
        </div>

        <div className="mt-12 max-w-2xl">
          <ContactMessageForm />
        </div>
      </section>
    </div>
  );
}
