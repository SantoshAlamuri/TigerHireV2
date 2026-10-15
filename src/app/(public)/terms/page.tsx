import Link from "next/link";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `${SITE_MARKETING.brand} Terms & Conditions — use of our hiring intelligence platform, scoring, and related services.`,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `Terms & Conditions — ${SITE_MARKETING.brand}`,
    description: `Agreement for using ${SITE_MARKETING.brand} — ${SITE_MARKETING.tagline.toLowerCase()}.`,
    url: "https://tigerhire.io/terms",
    siteName: "TigerHire",
    type: "website",
    images: [
      {
        url: "https://tigerhire.io/icons/icon-512.png",
        width: 512,
        height: 512,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Terms & Conditions — ${SITE_MARKETING.brand}`,
    description: `Terms of use for ${SITE_MARKETING.brand}.`,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

const EFFECTIVE_DATE = "2 April 2026";
const LAST_UPDATED = "23 February 2026";

export default function TermsPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-20 md:py-28 lg:px-8">
        <h1 className="heading-page text-3xl text-[var(--text)] md:text-4xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-3 text-sm text-[var(--text-subtle)]">
          Effective date: {EFFECTIVE_DATE} &middot; Last updated: {LAST_UPDATED}
        </p>

        <div className="prose-legal mt-10 space-y-10 text-[0.92rem] leading-relaxed text-[var(--text-muted)]">
          {/* ─── 1. Acceptance ─── */}
          <Section n="1" title="Acceptance of Terms">
            <p>
              These Terms &amp; Conditions (&quot;Terms&quot;) constitute a legally binding
              agreement between you (&quot;User,&quot; &quot;you,&quot; &quot;your&quot;) and{" "}
              <strong className="text-[var(--text)]">TigerHire</strong> (&quot;TigerHire,&quot;
              &quot;we,&quot; &quot;us,&quot; &quot;our&quot;), operating the website{" "}
              <strong className="text-[var(--text)]">tigerhire.io</strong> and related services (the
              &quot;Platform&quot;).
            </p>
            <p>
              By creating an account, accessing, or using the Platform, you confirm that you have
              read, understood, and agree to be bound by these Terms and our{" "}
              <Link
                href="/privacy"
                className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
              >
                Privacy Policy
              </Link>
              . If you do not agree, you must not use the Platform.
            </p>
          </Section>

          {/* ─── 2. Eligibility ─── */}
          <Section n="2" title="Eligibility">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                You must be at least <strong className="text-[var(--text)]">18 years of age</strong>{" "}
                and legally capable of entering into binding contracts.
              </li>
              <li>
                If you are using the Platform on behalf of an organisation, you represent and
                warrant that you have authority to bind that organisation to these Terms.
              </li>
              <li>
                You must provide accurate, current, and complete information during registration and
                keep it updated.
              </li>
            </ul>
          </Section>

          {/* ─── 3. Platform Description ─── */}
          <Section n="3" title="Platform Description">
            <p>
              TigerHire is an AI-powered applicant tracking and talent-matching platform for hiring
              teams worldwide. Key features include:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text)]">FitScore</strong> — an AI-generated
                compatibility score with an explainable breakdown for each candidate-job pairing.
              </li>
              <li>
                <strong className="text-[var(--text)]">ATS pipeline</strong> — tools for posting
                jobs, managing applications, shortlisting, and hiring.
              </li>
              <li>
                <strong className="text-[var(--text)]">WhatsApp candidate channel</strong> —
                candidate engagement via WhatsApp for applications, status updates, and
                communication (employer teams typically use the web application for workflow and
                approvals).
              </li>
              <li>
                <strong className="text-[var(--text)]">AI-assisted JD generation</strong> — job
                description drafting powered by artificial intelligence.
              </li>
            </ul>
          </Section>

          {/* ─── 4. User Accounts ─── */}
          <Section n="4" title="User Accounts &amp; Responsibilities">
            <h4 className="mt-2 text-sm font-semibold text-[var(--text)]">4.1 Account Security</h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                You are responsible for maintaining the confidentiality of your login credentials.
              </li>
              <li>
                You must notify us immediately at{" "}
                <a
                  href="mailto:security@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  security@tigerhire.io
                </a>{" "}
                upon becoming aware of any unauthorised use.
              </li>
              <li>
                We are not liable for losses arising from unauthorised use of your account where you
                have failed to safeguard your credentials.
              </li>
            </ul>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">4.2 Employer Users</h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Employers must ensure that all job postings comply with applicable labour,
                anti-discrimination, and equal-pay laws in every jurisdiction where they recruit.
              </li>
              <li>
                Employers are solely responsible for verifying candidate information and making
                independent hiring decisions.
              </li>
              <li>
                Scoring results are advisory aids and do not constitute hiring recommendations or
                endorsements.
              </li>
            </ul>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">4.3 Candidate Users</h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Candidates warrant that all information provided (including CVs) is truthful,
                accurate, and not misleading.
              </li>
              <li>
                Submission of fraudulent or materially inaccurate information may result in
                immediate account termination.
              </li>
              <li>
                Candidates acknowledge that applying through the Platform does not guarantee
                employment or an interview.
              </li>
            </ul>
          </Section>

          {/* ─── 5. AI & FitScore ─── */}
          <Section n="5" title="AI-Powered Features &amp; Scoring">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                FitScore is generated by AI models and is a{" "}
                <strong className="text-[var(--text)]">decision-support tool</strong>, not a
                decision-maker. Final hiring decisions remain with the employer.
              </li>
              <li>
                TigerHire does not guarantee the accuracy, completeness, or suitability of any
                AI-generated output, including scores and auto-generated job descriptions.
              </li>
              <li>
                No AI system is infallible. Scoring runs only against criteria a human has approved,
                and every score is traceable to those criteria — but users must exercise independent
                judgment and remain responsible for hiring decisions.
              </li>
              <li>
                Any AI-generated content (e.g. job descriptions) must be reviewed and approved by
                the user before publication.
              </li>
              <li>
                We comply with GDPR Art. 22 (automated decision-making) by ensuring meaningful human
                oversight of all consequential decisions.
              </li>
            </ul>
          </Section>

          {/* ─── 6. Acceptable Use ─── */}
          <Section n="6" title="Acceptable Use Policy">
            <p>
              You agree <strong className="text-[var(--text)]">not</strong> to:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Use the Platform for any unlawful purpose or in violation of any applicable law.
              </li>
              <li>
                Post false, misleading, discriminatory, or fraudulent job listings or candidate
                profiles.
              </li>
              <li>
                Scrape, crawl, or use automated tools to extract data from the Platform without
                written permission.
              </li>
              <li>
                Attempt to reverse-engineer, decompile, or access the source code or AI models
                underlying the Platform.
              </li>
              <li>Upload viruses, malware, or any harmful code.</li>
              <li>Harass, threaten, or abuse other users.</li>
              <li>Circumvent security measures, access controls, or usage limits.</li>
              <li>Use the Platform to build a competing product or service.</li>
              <li>Share, resell, or sub-license your account access to any third party.</li>
            </ul>
            <p>
              Violation of this policy may result in immediate suspension or termination of your
              account, without refund, and may be reported to law enforcement where appropriate.
            </p>
          </Section>

          {/* ─── 7. Fees & Payment ─── */}
          <Section n="7" title="Fees &amp; Payment">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Certain features of the Platform may require a paid subscription. Pricing is
                displayed on the{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  Pricing
                </Link>{" "}
                page.
              </li>
              <li>
                All fees are exclusive of applicable taxes (such as VAT, GST, or sales tax) in your
                billing jurisdiction unless stated otherwise.
              </li>
              <li>
                Payments are processed through third-party payment processors. We do not store full
                card numbers.
              </li>
              <li>
                Subscriptions renew automatically unless cancelled at least{" "}
                <strong className="text-[var(--text)]">7 days</strong> before the renewal date.
              </li>
              <li>
                Refunds are provided only where expressly required by applicable law or at
                TigerHire&apos;s sole discretion.
              </li>
            </ul>
          </Section>

          {/* ─── 8. Intellectual Property ─── */}
          <Section n="8" title="Intellectual Property">
            <h4 className="mt-2 text-sm font-semibold text-[var(--text)]">
              8.1 TigerHire&apos;s IP
            </h4>
            <p>
              All content, software, algorithms (including FitScore), trademarks, logos, and trade
              dress on the Platform are the exclusive property of TigerHire or its licensors.
              Nothing in these Terms grants you any right, title, or interest in TigerHire&apos;s
              intellectual property.
            </p>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">8.2 User Content</h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                You retain ownership of all content you submit (CVs, job descriptions, messages).
              </li>
              <li>
                By submitting content, you grant TigerHire a worldwide, non-exclusive, royalty-free
                licence to use, process, store, and display such content solely to provide and
                improve the Platform.
              </li>
              <li>
                You represent that you have all necessary rights to submit such content and that it
                does not infringe any third-party rights.
              </li>
            </ul>
          </Section>

          {/* ─── 9. Data Protection ─── */}
          <Section n="9" title="Data Protection">
            <p>
              Our processing of personal data is governed by our{" "}
              <Link
                href="/privacy"
                className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
              >
                Privacy Policy
              </Link>
              , which forms an integral part of these Terms. Key commitments:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                We comply with applicable data protection law, including the{" "}
                <strong className="text-[var(--text)]">
                  General Data Protection Regulation (EU) 2016/679
                </strong>{" "}
                where it applies and other requirements described in our Privacy Policy.
              </li>
              <li>
                Employer users act as joint Data Fiduciaries / Controllers alongside TigerHire for
                candidate data processed through the Platform.
              </li>
              <li>
                We will execute a Data Processing Agreement (DPA) with enterprise clients upon
                request.
              </li>
            </ul>
          </Section>

          {/* ─── 10. Confidentiality ─── */}
          <Section n="10" title="Confidentiality">
            <p>
              Each party agrees to keep confidential any proprietary or sensitive information
              disclosed by the other party in connection with the Platform. This obligation survives
              termination for a period of <strong className="text-[var(--text)]">3 years</strong>.
            </p>
            <p>
              This does not apply to information that: (a) is publicly available, (b) was known to
              the receiving party before disclosure, (c) is independently developed, or (d) is
              required to be disclosed by law.
            </p>
          </Section>

          {/* ─── 11. Disclaimers ─── */}
          <Section n="11" title="Disclaimers">
            <p className="font-semibold uppercase text-[var(--text)]">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                The Platform is provided{" "}
                <strong className="text-[var(--text)]">&quot;AS IS&quot;</strong> and{" "}
                <strong className="text-[var(--text)]">&quot;AS AVAILABLE&quot;</strong> without
                warranties of any kind, whether express, implied, or statutory.
              </li>
              <li>
                We do not warrant that the Platform will be uninterrupted, error-free, or free of
                harmful components.
              </li>
              <li>
                We do not endorse, guarantee, or take responsibility for any candidate, employer,
                job listing, or hiring outcome.
              </li>
              <li>
                FitScore and all AI-generated outputs are provided for informational purposes only
                and should not be the sole basis for any hiring or employment decision.
              </li>
              <li>
                We disclaim liability for any losses resulting from reliance on AI-generated content
                without independent verification.
              </li>
            </ul>
          </Section>

          {/* ─── 12. Limitation of Liability ─── */}
          <Section n="12" title="Limitation of Liability">
            <p className="font-semibold uppercase text-[var(--text)]">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                TigerHire&apos;s total aggregate liability for any claims arising under or in
                connection with these Terms shall not exceed the amount paid by you to TigerHire in
                the <strong className="text-[var(--text)]">12 months</strong> preceding the claim,
                or <strong className="text-[var(--text)]">INR 50,000</strong>, whichever is greater.
              </li>
              <li>
                In no event shall TigerHire be liable for indirect, incidental, special,
                consequential, or punitive damages, including loss of profits, data, goodwill, or
                business opportunity.
              </li>
              <li>
                This limitation applies regardless of the theory of liability (contract, tort,
                strict liability, or otherwise).
              </li>
            </ul>
            <p>
              Nothing in these Terms excludes or limits liability for fraud, gross negligence, death
              or personal injury caused by negligence, or any liability that cannot be limited by
              law.
            </p>
          </Section>

          {/* ─── 13. Indemnification ─── */}
          <Section n="13" title="Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless TigerHire, its officers, directors,
              employees, and agents from and against any claims, damages, losses, liabilities,
              costs, and expenses (including reasonable legal fees) arising out of or in connection
              with:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Your use or misuse of the Platform.</li>
              <li>Your violation of these Terms or any applicable law.</li>
              <li>Content you submit that infringes third-party rights.</li>
              <li>Your hiring decisions or employment practices (for employer users).</li>
              <li>Inaccurate or fraudulent information you provide (for candidate users).</li>
            </ul>
          </Section>

          {/* ─── 14. Termination ─── */}
          <Section n="14" title="Termination">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                You may close your account at any time by contacting{" "}
                <a
                  href="mailto:hello@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  hello@tigerhire.io
                </a>{" "}
                or through the account settings.
              </li>
              <li>
                We may suspend or terminate your account immediately if you breach these Terms,
                engage in fraudulent activity, or if required by law.
              </li>
              <li>
                Upon termination, your right to use the Platform ceases immediately. Provisions that
                by their nature should survive (including Sections 8, 10, 11, 12, 13, 15, 16, and
                17) shall survive termination.
              </li>
              <li>
                Data deletion following termination is governed by our{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  Privacy Policy
                </Link>
                .
              </li>
            </ul>
          </Section>

          {/* ─── 15. Governing Law & Dispute Resolution ─── */}
          <Section n="15" title="Governing Law &amp; Dispute Resolution">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                These Terms are governed by and construed in accordance with the{" "}
                <strong className="text-[var(--text)]">laws of England and Wales</strong>, without
                regard to conflict-of-law principles.
              </li>
              <li>
                Any dispute arising out of or in connection with these Terms shall first be
                attempted to be resolved through good-faith negotiation for a period of{" "}
                <strong className="text-[var(--text)]">30 days</strong>.
              </li>
              <li>
                If negotiation fails, disputes shall be submitted to{" "}
                <strong className="text-[var(--text)]">binding arbitration</strong> under the LCIA
                Rules, seated in{" "}
                <strong className="text-[var(--text)]">London, United Kingdom</strong>, in English.
              </li>
              <li>
                The arbitration shall be conducted by a sole arbitrator appointed in accordance with
                the LCIA Rules.
              </li>
              <li>
                Notwithstanding the above, either party may seek injunctive or equitable relief from
                the courts of England and Wales.
              </li>
              <li>
                For users in the EU/EEA, nothing in this section limits your right to file a
                complaint with a supervisory authority or bring proceedings before the courts of
                your habitual residence, as provided by applicable consumer protection law.
              </li>
            </ul>
          </Section>

          {/* ─── 16. Force Majeure ─── */}
          <Section n="16" title="Force Majeure">
            <p>
              TigerHire shall not be liable for any failure or delay in performance resulting from
              circumstances beyond our reasonable control, including but not limited to natural
              disasters, pandemics, wars, government actions, power failures, internet outages, or
              third-party service failures.
            </p>
          </Section>

          {/* ─── 17. General Provisions ─── */}
          <Section n="17" title="General Provisions">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text)]">Entire Agreement</strong> — these Terms,
                together with the Privacy Policy, constitute the entire agreement between you and
                TigerHire.
              </li>
              <li>
                <strong className="text-[var(--text)]">Severability</strong> — if any provision is
                held invalid or unenforceable, the remaining provisions continue in full force.
              </li>
              <li>
                <strong className="text-[var(--text)]">Waiver</strong> — failure to enforce any
                provision does not constitute a waiver of the right to enforce it subsequently.
              </li>
              <li>
                <strong className="text-[var(--text)]">Assignment</strong> — you may not assign your
                rights under these Terms without our written consent. We may assign our rights
                without restriction.
              </li>
              <li>
                <strong className="text-[var(--text)]">Notices</strong> — legal notices to TigerHire
                must be sent to{" "}
                <a
                  href="mailto:legal@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  legal@tigerhire.io
                </a>
                . Notices to users will be sent to the email associated with the account.
              </li>
              <li>
                <strong className="text-[var(--text)]">Amendments</strong> — we reserve the right to
                modify these Terms at any time. Material changes will be notified at least{" "}
                <strong className="text-[var(--text)]">14 days</strong> in advance via email or
                prominent notice. Continued use constitutes acceptance.
              </li>
              <li>
                <strong className="text-[var(--text)]">Language</strong> — these Terms are drafted
                in English. In the event of a conflict between translations, the English version
                prevails.
              </li>
            </ul>
          </Section>

          {/* ─── 18. Contact ─── */}
          <Section n="18" title="Contact Us">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm">
              <p className="font-semibold text-[var(--text)]">TigerHire</p>
              <p className="mt-1">Remote-first · global operations</p>
              <p>
                Legal:{" "}
                <a
                  href="mailto:legal@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  legal@tigerhire.io
                </a>
              </p>
              <p>
                General:{" "}
                <a
                  href="mailto:hello@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  hello@tigerhire.io
                </a>
              </p>
            </div>
          </Section>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            href="/privacy"
            className="inline-flex font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
          >
            Privacy Policy &rarr;
          </Link>
          <Link
            href="/"
            className="inline-flex font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            Back to home
          </Link>
        </div>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`section-${n}`}>
      <h2 className="heading-card text-lg text-[var(--text)]">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
