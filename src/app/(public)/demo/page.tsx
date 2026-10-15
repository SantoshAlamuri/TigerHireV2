import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { buttonClasses } from "@/components/ui/Button";
import { DemoSectionV2, HowSectionV2 } from "@/components/marketing/v2/StorySectionsV2";

export const metadata: Metadata = {
  title: "Live demo — score CVs against your JD right now",
  description:
    "Paste any job description, watch TigerHire draft a weighted rubric, and score 10 CVs live — our sample pool or your own uploads. Free, no signup.",
  alternates: { canonical: "/demo" },
};

/** Dedicated try-it-now page; the homepage links here instead of embedding the widget. */
export default function DemoPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main>
        <DemoSectionV2 />
        <HowSectionV2 />
        <section className="border-t border-[var(--border)] px-6 py-20 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              Liked what it did with one JD?
            </h2>
            <p className="mx-auto mb-8 mt-3 text-lg text-[var(--text-muted)]">
              Give it a live role. If our shortlist doesn&apos;t match your hiring manager&apos;s
              picks, you pay nothing.
            </p>
            <Link href="/contact" className={buttonClasses("primary", "lg", "gap-2.5")}>
              Start the wager <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
