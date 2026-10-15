import Link from "next/link";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `${SITE_MARKETING.brand} Privacy Policy — how we handle personal data for our hiring intelligence platform. GDPR and applicable global privacy requirements.`,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `Privacy Policy — ${SITE_MARKETING.brand}`,
    description: `How ${SITE_MARKETING.brand} collects, uses, stores, and protects your data. GDPR-aligned with region-specific disclosures where required.`,
    url: "https://tigerhire.io/privacy",
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
    title: `Privacy Policy — ${SITE_MARKETING.brand}`,
    description: `How ${SITE_MARKETING.brand} handles your personal data. GDPR and applicable privacy law.`,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

const EFFECTIVE_DATE = "2 April 2026";
const LAST_UPDATED = "23 February 2026";

export default function PrivacyPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-20 md:py-28 lg:px-8">
        <h1 className="heading-page text-3xl text-[var(--text)] md:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[var(--text-subtle)]">
          Effective date: {EFFECTIVE_DATE} &middot; Last updated: {LAST_UPDATED}
        </p>

        <div className="prose-legal mt-10 space-y-10 text-[0.92rem] leading-relaxed text-[var(--text-muted)]">
          {/* ─── 1. Introduction ─── */}
          <Section n="1" title="Introduction">
            <p>
              TigerHire (&quot;TigerHire,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
              operates the website <strong className="text-[var(--text)]">tigerhire.io</strong> and
              related services (collectively, the &quot;Platform&quot;). This Privacy Policy
              explains how we collect, use, disclose, store, and protect personal data when you use
              the Platform.
            </p>
            <p>
              We process personal data in accordance with the{" "}
              <strong className="text-[var(--text)]">
                General Data Protection Regulation (EU) 2016/679 (&quot;GDPR&quot;)
              </strong>{" "}
              where it applies, and other applicable privacy and data-protection laws in the regions
              where we operate and where our users are located.
            </p>
            <p>
              By accessing or using TigerHire, you acknowledge that you have read and understood
              this Privacy Policy. If you do not agree, please discontinue use of the Platform.
            </p>
          </Section>

          {/* ─── 2. Definitions ─── */}
          <Section n="2" title="Definitions">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-[var(--text)]">&quot;Data Subject&quot;</strong> (GDPR) /
                equivalent terms under other laws — the individual to whom the personal data
                relates.
              </li>
              <li>
                <strong className="text-[var(--text)]">&quot;Data Controller&quot;</strong> (GDPR) /
                equivalent terms under other laws — TigerHire, who determines the purpose and means
                of processing where we act as controller.
              </li>
              <li>
                <strong className="text-[var(--text)]">&quot;Personal Data&quot;</strong> — any data
                about an individual who is identifiable by or in relation to such data.
              </li>
              <li>
                <strong className="text-[var(--text)]">&quot;Processing&quot;</strong> — any
                operation performed on personal data, whether automated or manual.
              </li>
              <li>
                <strong className="text-[var(--text)]">&quot;FitScore&quot;</strong> —
                TigerHire&apos;s proprietary AI-generated compatibility score between a candidate
                and a job posting.
              </li>
            </ul>
          </Section>

          {/* ─── 3. Data We Collect ─── */}
          <Section n="3" title="Data We Collect">
            <h4 className="mt-2 text-sm font-semibold text-[var(--text)]">
              3.1 Information You Provide
            </h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Account registration data (name, email address, phone number, organisation name).
              </li>
              <li>
                Candidate profiles (CV content, skills, experience, education, contact details).
              </li>
              <li>Job descriptions and hiring-request details submitted by employer users.</li>
              <li>Messages exchanged through the Platform&apos;s messaging features.</li>
              <li>
                Payment and billing information (processed via third-party payment processors; we do
                not store full card numbers).
              </li>
              <li>Any correspondence you send to us (e.g. support requests, feedback).</li>
            </ul>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">
              3.2 Information Collected Automatically
            </h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Device and browser information (IP address, user-agent, screen resolution).</li>
              <li>Usage data (pages visited, clicks, timestamps, session duration).</li>
              <li>Cookies and similar tracking technologies (see Section 9).</li>
              <li>Log data and error reports.</li>
            </ul>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">
              3.3 Information from Third Parties
            </h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Data from job boards or recruitment platforms where you have authorised sharing.
              </li>
              <li>
                Publicly available professional information (e.g. LinkedIn profiles) only when you
                provide consent.
              </li>
            </ul>
          </Section>

          {/* ─── 4. Legal Basis for Processing ─── */}
          <Section n="4" title="Legal Basis for Processing">
            <p>We process personal data on the following legal grounds:</p>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text)]">
                    <th className="pb-2 pr-4 font-semibold">Purpose</th>
                    <th className="pb-2 pr-4 font-semibold">GDPR Basis</th>
                    <th className="pb-2 font-semibold">Other jurisdictions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  <tr>
                    <td className="py-2 pr-4">Account creation & service delivery</td>
                    <td className="py-2 pr-4">Art. 6(1)(b) — Contract</td>
                    <td className="py-2">Contract / consent as required locally</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">AI scoring & analysis</td>
                    <td className="py-2 pr-4">Art. 6(1)(b) — Contract</td>
                    <td className="py-2">Contract / legitimate interest</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Analytics & Platform improvement</td>
                    <td className="py-2 pr-4">Art. 6(1)(f) — Legitimate interest</td>
                    <td className="py-2">Legitimate interest</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Marketing communications</td>
                    <td className="py-2 pr-4">Art. 6(1)(a) — Consent</td>
                    <td className="py-2">Consent</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Legal compliance & dispute resolution</td>
                    <td className="py-2 pr-4">Art. 6(1)(c) — Legal obligation</td>
                    <td className="py-2">Legal obligation</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* ─── 5. How We Use Your Data ─── */}
          <Section n="5" title="How We Use Your Data">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To operate, maintain, and improve the Platform and its features.</li>
              <li>To generate scoring results using AI-based matching algorithms.</li>
              <li>To facilitate communication between candidates and hiring organisations.</li>
              <li>
                To send transactional notifications (e.g. application status updates) via email,
                SMS, or WhatsApp.
              </li>
              <li>To send marketing or promotional materials only where you have opted in.</li>
              <li>
                To detect, prevent, and address fraud, abuse, security incidents, and technical
                issues.
              </li>
              <li>To comply with legal obligations, enforce our Terms, and protect our rights.</li>
              <li>To conduct aggregated, anonymised analytics for research and reporting.</li>
            </ul>
          </Section>

          {/* ─── 6. AI & Automated Decision-Making ─── */}
          <Section n="6" title="AI-Powered Processing & Automated Decision-Making">
            <p>
              TigerHire uses artificial intelligence to generate scoring assessments and candidate
              shortlists. These are{" "}
              <strong className="text-[var(--text)]">decision-support tools</strong> — they assist
              human recruiters but do not make final hiring decisions autonomously.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Every score includes an explainable breakdown so both employer and candidate can
                understand why a particular score was assigned.
              </li>
              <li>
                No automated decision with legal or significant effect is made without meaningful
                human oversight (GDPR Art. 22).
              </li>
              <li>
                You may request a manual review of any AI-generated assessment by contacting us.
              </li>
              <li>
                Scoring criteria are approved by a human before any candidate is scored, every score
                records the exact criteria and approver used, and no candidate is rejected
                automatically by the AI. We are building formal fairness reporting and will publish
                our methodology when it is in place.
              </li>
            </ul>
          </Section>

          {/* ─── 7. Data Sharing & Disclosure ─── */}
          <Section n="7" title="Data Sharing &amp; Disclosure">
            <p>We do not sell your personal data. We share data only in these circumstances:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text)]">With employers / candidates</strong> — to
                facilitate the hiring process (e.g. sharing a candidate&apos;s profile with an
                employer they applied to).
              </li>
              <li>
                <strong className="text-[var(--text)]">Service providers</strong> — hosting (cloud
                infrastructure providers), analytics, payment processing, email / SMS / WhatsApp
                delivery. All service providers are bound by data-processing agreements.
              </li>
              <li>
                <strong className="text-[var(--text)]">Legal requirements</strong> — when required
                by law, regulation, court order, or governmental authority.
              </li>
              <li>
                <strong className="text-[var(--text)]">Business transfers</strong> — in connection
                with a merger, acquisition, or sale of assets, with prior notice to users.
              </li>
              <li>
                <strong className="text-[var(--text)]">With your consent</strong> — for any purpose
                not described above, only after obtaining your explicit consent.
              </li>
            </ul>
          </Section>

          {/* ─── 8. International Data Transfers ─── */}
          <Section n="8" title="International Data Transfers">
            <p>
              TigerHire uses cloud infrastructure in regions operated by our sub-processors. Where
              data moves across borders, we ensure appropriate safeguards are in place:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission.</li>
              <li>
                Adequacy decisions or other transfer mechanisms recognised under applicable law.
              </li>
              <li>
                Data-processing agreements with all sub-processors that mandate equivalent
                data-protection standards.
              </li>
            </ul>
          </Section>

          {/* ─── 9. Cookies & Tracking ─── */}
          <Section n="9" title="Cookies &amp; Tracking Technologies">
            <p>We use the following categories of cookies:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text)]">Strictly necessary</strong> — authentication,
                session management, security. These cannot be disabled.
              </li>
              <li>
                <strong className="text-[var(--text)]">Functional</strong> — preferences, language,
                previously viewed items.
              </li>
              <li>
                <strong className="text-[var(--text)]">Analytics</strong> — aggregated usage
                analytics (e.g. PostHog). We anonymise IP addresses.
              </li>
              <li>
                <strong className="text-[var(--text)]">Marketing</strong> — used only with explicit
                consent to deliver relevant communications.
              </li>
            </ul>
            <p>
              You can manage cookie preferences through your browser settings or our cookie-consent
              banner. Disabling non-essential cookies will not affect core functionality.
            </p>
          </Section>

          {/* ─── 10. Data Retention ─── */}
          <Section n="10" title="Data Retention">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Active account data is retained for the duration of your relationship with us.
              </li>
              <li>
                Candidate profiles are retained for{" "}
                <strong className="text-[var(--text)]">3 years</strong> after the last activity
                unless you request earlier deletion.
              </li>
              <li>
                Application and hiring records are retained for{" "}
                <strong className="text-[var(--text)]">5 years</strong> to comply with employment
                and applicable employment and tax law.
              </li>
              <li>Anonymised analytics data may be retained indefinitely.</li>
              <li>
                Upon account deletion, personal data is purged from active systems within{" "}
                <strong className="text-[var(--text)]">30 days</strong> and from backups within{" "}
                <strong className="text-[var(--text)]">90 days</strong>.
              </li>
            </ul>
          </Section>

          {/* ─── 11. Data Security ─── */}
          <Section n="11" title="Data Security">
            <p>We implement appropriate technical and organisational measures including:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Encryption in transit (TLS 1.2+) and at rest (AES-256).</li>
              <li>Role-based access controls and the principle of least privilege.</li>
              <li>Regular vulnerability assessments and penetration testing.</li>
              <li>
                Incident-response procedures with notification within 72 hours of a confirmed breach
                (per GDPR Art. 33 and comparable requirements where applicable).
              </li>
              <li>Employee and contractor confidentiality obligations.</li>
            </ul>
          </Section>

          {/* ─── 12. Your Rights ─── */}
          <Section n="12" title="Your Rights">
            <h4 className="mt-2 text-sm font-semibold text-[var(--text)]">
              Under the GDPR (EEA residents)
            </h4>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text)]">Access</strong> — request a copy of your
                personal data (Art. 15).
              </li>
              <li>
                <strong className="text-[var(--text)]">Rectification</strong> — correct inaccurate
                data (Art. 16).
              </li>
              <li>
                <strong className="text-[var(--text)]">Erasure</strong> — request deletion
                (&quot;right to be forgotten&quot;) (Art. 17).
              </li>
              <li>
                <strong className="text-[var(--text)]">Restriction</strong> — limit processing in
                certain circumstances (Art. 18).
              </li>
              <li>
                <strong className="text-[var(--text)]">Portability</strong> — receive your data in a
                structured, machine-readable format (Art. 20).
              </li>
              <li>
                <strong className="text-[var(--text)]">Object</strong> — object to processing based
                on legitimate interest (Art. 21).
              </li>
              <li>
                <strong className="text-[var(--text)]">Automated decisions</strong> — not be subject
                to purely automated decisions with legal effect (Art. 22).
              </li>
              <li>
                <strong className="text-[var(--text)]">Withdraw consent</strong> — at any time,
                without affecting the lawfulness of prior processing (Art. 7(3)).
              </li>
            </ul>

            <h4 className="mt-6 text-sm font-semibold text-[var(--text)]">
              Other local privacy rights
            </h4>
            <p className="mt-2">
              Depending on where you live, you may have additional rights (for example access,
              correction, deletion, portability, or objection). To exercise GDPR or other applicable
              rights, contact{" "}
              <a
                href="mailto:privacy@tigerhire.io"
                className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
              >
                privacy@tigerhire.io
              </a>
              . We will respond within <strong className="text-[var(--text)]">30 days</strong> where
              required by law.
            </p>
          </Section>

          {/* ─── 13. Children's Privacy ─── */}
          <Section n="13" title="Children's Privacy">
            <p>
              The Platform is not directed at individuals under the age of{" "}
              <strong className="text-[var(--text)]">18 years</strong>. We do not knowingly collect
              personal data from children. If you believe we have inadvertently collected such data,
              please contact us immediately and we will delete it within 72 hours.
            </p>
          </Section>

          {/* ─── 14. Grievance Officer ─── */}
          <Section n="14" title="Privacy complaints">
            <p>
              For privacy questions or complaints, contact our privacy team. We will acknowledge and
              work to resolve requests in line with applicable law.
            </p>
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm">
              <p className="font-semibold text-[var(--text)]">Privacy — TigerHire</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:grievance@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  grievance@tigerhire.io
                </a>
              </p>
              <p>Response time: within 30 days of receipt of complaint.</p>
            </div>
            <p className="mt-3">
              If you are not satisfied with our response, you may contact the data-protection or
              privacy supervisory authority in your country, or where the GDPR applies, your local
              EEA supervisory authority.
            </p>
          </Section>

          {/* ─── 15. GDPR Representative ─── */}
          <Section n="15" title="EU/EEA Representative (GDPR Art. 27)">
            <p>
              Where required under GDPR Article 27, we will publish details of our EU/EEA
              representative here.
            </p>
          </Section>

          {/* ─── 16. Third-Party Links ─── */}
          <Section n="16" title="Third-Party Links">
            <p>
              The Platform may contain links to third-party websites or services. We are not
              responsible for the privacy practices or content of those third parties. We encourage
              you to read their privacy policies before providing any personal data.
            </p>
          </Section>

          {/* ─── 17. Changes ─── */}
          <Section n="17" title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be notified
              via email or a prominent notice on the Platform at least{" "}
              <strong className="text-[var(--text)]">14 days</strong> before taking effect.
              Continued use after the effective date constitutes acceptance of the revised policy.
            </p>
          </Section>

          {/* ─── 18. Contact ─── */}
          <Section n="18" title="Contact Us">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm">
              <p className="font-semibold text-[var(--text)]">TigerHire</p>
              <p className="mt-1">Remote-first · global operations</p>
              <p>
                Email:{" "}
                <a
                  href="mailto:privacy@tigerhire.io"
                  className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)]"
                >
                  privacy@tigerhire.io
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
            href="/terms"
            className="inline-flex font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
          >
            Terms &amp; Conditions &rarr;
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
