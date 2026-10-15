import Link from "next/link";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Data Processing Agreement (DPA)",
  description: `${SITE_MARKETING.brand} — B2B data processing overview and how to request a DPA for your organisation.`,
  alternates: { canonical: "/dpa" },
  openGraph: {
    title: `Data Processing (DPA) — ${SITE_MARKETING.brand}`,
    url: "https://tigerhire.io/dpa",
  },
};

export default function DpaPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-20 md:py-28 lg:px-8">
        <h1 className="heading-page text-3xl text-[var(--text)] md:text-4xl">
          Data processing (B2B)
        </h1>
        <p className="mt-3 text-sm text-[var(--text-subtle)]">Last updated: April 24, 2026</p>

        <div className="prose-prose mt-8 space-y-4 text-sm leading-relaxed text-[var(--text-muted)]">
          <p>
            {SITE_MARKETING.brand} is a B2B hiring platform. Organisations (controllers) use our
            service to process candidate and job-related personal data. We act as a processor in
            relation to the data you submit into the product on behalf of your organisation, subject
            to your settings and the{" "}
            <Link className="text-[var(--accent)] hover:underline" href="/terms">
              Terms
            </Link>{" "}
            and{" "}
            <Link className="text-[var(--accent)] hover:underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            <strong className="text-[var(--text)]">DPA (enterprise):</strong> A formal Data
            Processing Agreement, including the European Commission Standard Contractual Clauses
            where required, is available to paying customers. Request it from your account contact
            or via{" "}
            <a className="text-[var(--accent)] hover:underline" href="mailto:legal@tigerhire.io">
              legal@tigerhire.io
            </a>{" "}
            (subject line: DPA), including your organisation name and the email used for the main
            workspace.
          </p>
          <p>
            <strong className="text-[var(--text)]">Subprocessors:</strong> The Privacy Policy lists
            categories of sub-processors (e.g. hosting, email, model providers) who support
            delivery. Enterprise customers can request a current subprocessor list as part of
            security review.
          </p>
        </div>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
