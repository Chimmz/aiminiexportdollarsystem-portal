import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | The AI-Powered Mini Export Dollar System',
  description: 'How The AI-Powered Mini Export Dollar System collects, uses, and protects your data.',
};

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

// Un-gated, at the root (proxy.ts only guards /dashboard/*) -- same
// verbatim content as mini-export-web's own /privacy page, duplicated
// per repo since the two apps don't share a codebase. Written in direct
// response to Paystack's compliance review questions about contact
// sourcing/consent (Nov 2026) -- see the contact-directories section.
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-prose px-6 py-16">
      <Link href="/" className="text-sm font-semibold leading-relaxed text-foreground">
        The AI-Powered Mini Export
        <br />
        <span className="text-accent-gold">Dollar System</span>
      </Link>

      <h1 className="mt-6 text-3xl font-semibold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated November 3, 2026</p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        This policy covers The AI-Powered Mini Export Dollar System, the guide, bonuses, and AI Export
        Mentor you may have purchased or are considering purchasing, across both this member portal and
        the sales site you bought from. It&apos;s operated by Chimarokem, as an individual, not a
        registered company.
      </p>

      <Section heading="What we collect">
        <p>
          <strong className="text-foreground">If you visit the sales site or start a checkout:</strong>{' '}
          name, email, phone number, and payment confirmation details. We never see or store your full
          card number. That&apos;s handled entirely by Paystack and Flutterwave, our payment processors.
        </p>
        <p>
          <strong className="text-foreground">If you become a member:</strong> your email (used for
          magic-link sign-in, no passwords), and everything that happens inside the AI Export Mentor
          chat: your messages, the product/deal details you share, and a small set of facts the AI
          extracts automatically to personalize later conversations. This is used only to serve you,
          never shared with other members or outside parties.
        </p>
        <p>
          <strong className="text-foreground">If you just browse the sales site:</strong> basic
          ad-tracking via Meta Pixel, used to measure which ads led to a purchase. You can opt out
          through your browser or Meta&apos;s own ad preferences.
        </p>
      </Section>

      <Section heading="The buyer and supplier contact directories">
        <p>
          As part of the AI Export Mentor, members get access to several contact directories, compiled
          from the original course material:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">International buyer contacts</strong> are a mix of
            contacts the course trainer has done business with personally over 15 years of exporting,
            and contacts compiled from publicly available business listings (e.g. LinkedIn, Google
            Business).
          </li>
          <li>
            <strong className="text-foreground">Local supplier contacts</strong> are self-reported:
            members of the course&apos;s private community who posted, in their own words, that they
            supply a given product, along with how to reach them.
          </li>
          <li>
            <strong className="text-foreground">Shipping/logistics and documentation/regulatory
            contacts</strong> are service providers, listed in their business capacity.
          </li>
        </ul>
        <p>
          These are a starting point for outreach, not a verified or exclusive registry. The Mentor
          always tells members to verify a contact independently before paying or shipping anything. If
          you are listed in one of these directories and want to be removed, email us (below) and we
          will remove you within 7 days.
        </p>
      </Section>

      <Section heading="Payments">
        <p>
          Paystack and Flutterwave process every payment on our behalf. We only ever receive a payment
          confirmation (amount, reference, and the email/phone/name given at checkout), never your card
          number, CVV, or bank login.
        </p>
      </Section>

      <Section heading="Other services we use">
        <p>
          To run this product, we also use: Supabase (hosts our database and handles sign-in), Resend
          (sends transactional emails like receipts and magic links), Cloudinary (hosts reference photos
          used by the AI Mentor), and an AI model provider, accessed through Vercel&apos;s AI Gateway, to
          run the AI Export Mentor&apos;s conversations. Each only ever processes the minimum data needed
          to do its specific job for us.
        </p>
      </Section>

      <Section heading="How long we keep data">
        <p>
          We keep your data for as long as your account is active or as needed to provide the service,
          resolve disputes, or meet a legal obligation, whichever is longer. If you ask us to delete
          your account, we will, except where we&apos;re legally required to keep payment records.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us, at any time, to: see what data we hold on you, correct anything inaccurate,
          delete your account and associated data, or stop using your data for a specific purpose. If
          you&apos;re one of the people listed in a contact directory (not a customer), you have the same
          right to ask to be removed. Email us and we&apos;ll respond within 7 days.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          We rely on Supabase&apos;s row-level security to keep member data isolated to that member, and
          never store full payment card details ourselves. No system is perfectly secure, but we take
          reasonable, standard precautions.
        </p>
      </Section>

      <Section heading="Who this is for">
        <p>
          This product is intended for adults running or starting a business. It isn&apos;t directed at
          children, and we don&apos;t knowingly collect data from anyone under 18.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If this policy changes in a material way, we&apos;ll update the date at the top and, where it
          affects you directly, tell you by email.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Chimarokem,{' '}
          <a href="mailto:chima@aipoweredminiexportdollarsystem.online" className="text-foreground underline">
            chima@aipoweredminiexportdollarsystem.online
          </a>
          . We aim to respond to any privacy or data request, including a contact-directory removal
          request, within 7 days.
        </p>
        <p>
          This policy is governed by the laws of the Federal Republic of Nigeria, including the Nigeria
          Data Protection Act 2023.
        </p>
      </Section>

      <p className="mt-12 text-sm">
        <Link href="/sign-in" className="text-muted-foreground underline hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
