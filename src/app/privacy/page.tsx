import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Yogiplate",
  description:
    "How Stone Craft Pizza LLC, operating Stone Craft Pizza and Yogiplate, collects, uses, and protects your information, including our SMS text messaging service.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 marker:text-accent">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="eyebrow">Legal</p>
        <h1 className="font-display mt-4 text-5xl text-foreground sm:text-6xl">Privacy Policy</h1>
        <p className="mt-4 text-sm font-semibold text-foreground">Effective date: October 9, 2026</p>

        <p className="mt-6 text-base leading-relaxed text-muted">
          This Privacy Policy explains how Stone Craft Pizza LLC, which operates the restaurant brands
          Stone Craft Pizza and Yogiplate (“we,” “us,” or “our”), collects, uses, and protects your
          information when you visit our websites (stonecraftpizza.us and yogiplate.com), place an
          order, contact us, or use our SMS text messaging service.
        </p>

        <Section title="Information We Collect">
          <p>We may collect the following information:</p>
          <Bullets
            items={[
              <><strong className="text-foreground">Contact information:</strong> your name, phone number, and email address.</>,
              <><strong className="text-foreground">Order and catering details:</strong> event date, party size, delivery or pickup address, menu selections, and dietary preferences you share with us.</>,
              <><strong className="text-foreground">Messages and communications:</strong> the content of text messages, emails, or other messages you send us.</>,
              <><strong className="text-foreground">Website usage information:</strong> basic technical data such as browser type, device information, and pages visited, collected through cookies or similar tools.</>,
            ]}
          />
        </Section>

        <Section title="How We Use Your Information">
          <p>We use your information to:</p>
          <Bullets
            items={[
              "Respond to your questions about our menu and catering services",
              "Prepare quotes, process orders, and arrange catering, delivery, or pickup",
              "Send messages you have requested, including SMS replies about your catering inquiry",
              "Improve our food, services, and websites",
              "Comply with legal obligations",
            ]}
          />
        </Section>

        <Section title="SMS Text Messaging">
          <p>
            When you text the keyword <strong className="text-foreground">CATERING</strong> to{" "}
            <a href="sms:+1-408-335-4055" className="font-semibold text-accent-deep hover:underline">
              (408) 335-4055
            </a>
            , you agree to receive text messages from Stone Craft Pizza Catering / Yogiplate Catering
            related to your catering inquiry.
          </p>
          <Bullets
            items={[
              "We collect your mobile number and the content of your messages so we can reply to your questions.",
              "Message frequency varies based on your inquiry. Msg & data rates may apply.",
              <>To opt out, reply <strong className="text-foreground">STOP</strong> at any time. You will receive one confirmation message, and no further messages will be sent.</>,
              <>For help, reply <strong className="text-foreground">HELP</strong> or contact us using the details below.</>,
            ]}
          />
          <p>
            We do not sell or share your SMS opt-in data or personal information with third parties for
            marketing purposes.
          </p>
          <p>
            Text messaging originator opt-in data and consent will not be shared with any third parties,
            except service providers that help us deliver messages, such as our SMS platform provider.
          </p>
        </Section>

        <Section title="How We Share Information">
          <p>We do not sell your personal information. We share information only:</p>
          <Bullets
            items={[
              "With service providers that help us run our business, such as payment processors, SMS and email providers, website hosting, and delivery partners, and only as needed to provide our services",
              "When required by law or to protect our rights, safety, or property",
            ]}
          />
        </Section>

        <Section title="Data Security">
          <p>
            We use reasonable administrative and technical measures to protect your information. No
            method of transmission or storage is completely secure, but we work to protect your data.
          </p>
        </Section>

        <Section title="Data Retention">
          <p>
            We keep your information only as long as needed to provide our services, maintain business
            records, and meet legal requirements.
          </p>
        </Section>

        <Section title="Your Choices and Rights">
          <p>
            You may ask us to access, correct, or delete your personal information by contacting us
            below. You can opt out of SMS at any time by replying STOP, and you can unsubscribe from
            emails using the link in any email we send. California residents may have additional rights
            under California law and may contact us to exercise them.
          </p>
        </Section>

        <Section title="Children’s Privacy">
          <p>
            Our services are not directed to children under 13, and we do not knowingly collect personal
            information from children under 13.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page with
            an updated effective date.
          </p>
        </Section>

        <Section title="Contact Us">
          <address className="border border-line bg-warm px-5 py-4 not-italic text-foreground">
            <p className="font-semibold">Stone Craft Pizza LLC (operating Stone Craft Pizza and Yogiplate)</p>
            <p className="mt-1">326 Commercial Street, San Jose, CA</p>
            <p className="mt-1">
              Phone:{" "}
              <a href="tel:+1-408-335-4055" className="font-semibold text-accent-deep hover:underline">
                (408) 335-4055
              </a>
            </p>
          </address>
        </Section>
      </article>
    </div>
  );
}
