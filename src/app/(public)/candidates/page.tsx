import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircle, MessageSquare, Sparkles } from "lucide-react";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import FitRing from "@/components/ui/FitRing";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "For Candidates",
  description: `Apply on WhatsApp, get clear fit scores, and hear back faster with ${SITE_MARKETING.brand}.`,
  alternates: { canonical: "/candidates" },
  openGraph: {
    title: `For Candidates — ${SITE_MARKETING.brand}`,
    description: "Drop your CV, see your fit score, and track what happens next.",
    url: "https://tigerhire.io/candidates",
    siteName: SITE_MARKETING.brand,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `For Candidates — ${SITE_MARKETING.brand}`,
    description: "Apply on WhatsApp with transparent fit scoring.",
  },
};

const FIT_DIMENSIONS = [
  { label: "Skills match", value: 92 },
  { label: "Experience relevance", value: 85 },
  { label: "Role context fit", value: 88 },
  { label: "Communication clarity", value: 81 },
] as const;

export default function CandidatesLandingPage() {
  const whatsappApplyUrl = getPublicWhatsAppChatUrl(publicWhatsAppPrefill.candidateApply);

  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="alive-air-hero relative z-10">
        <section className="relative overflow-hidden px-5 py-32 lg:px-8 lg:py-40">
          <div
            className="mesh-orb mesh-orb-1 left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 bg-amber-500/[0.06]"
            aria-hidden
          />
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/75">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              For candidates
            </span>
            <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl">
              <span className="heading-display-light text-white/55">No CV black hole.</span>
              <br />
              <span className="text-white">See where you stand.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl">
              Apply on WhatsApp, get a clear FitScore, and move faster with recruiter responses that
              are grounded in one transparent standard.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href={whatsappApplyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-bloom-lg group inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <MessageCircle size={16} className="text-emerald-700" />
                Drop CV on WhatsApp
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                How it works
              </p>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">From CV drop to</span>{" "}
                <span className="text-white">recruiter response</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Drop your CV",
                body: "Send your PDF on WhatsApp or apply through a role link in under a minute.",
              },
              {
                step: "02",
                title: "Get clear fit scores",
                body: "See how well you match each role with plain-English reasons.",
              },
              {
                step: "03",
                title: "Move forward faster",
                body: "Recruiters review one standard and respond with clearer next steps.",
              },
            ].map((item, index) => (
              <ScrollReveal key={item.step} delay={index * 90} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.06] text-xs font-bold text-white ring-1 ring-inset ring-white/[0.08]">
                    {item.step}
                  </span>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Fit score preview
              </p>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">Know your fit</span>{" "}
                <span className="text-white">before interviews</span>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={120}>
            <div className="alive-halo-lg mt-10">
              <div className="card-lifted-marketing p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <FitRing score={87} size={96} showLabel={false} />
                  <p className="heading-display tabular-nums text-4xl text-[var(--accent)] [text-shadow:0_0_18px_rgba(245,158,11,0.3)]">
                    87/100
                  </p>
                  <p className="text-sm text-white/55">Sample match score for a live role</p>
                </div>
                <div className="mt-8 space-y-3">
                  {FIT_DIMENSIONS.map((dim) => (
                    <div key={dim.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/65">{dim.label}</span>
                        <span className="tabular-nums text-white">{dim.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.08]">
                        <div
                          className="h-2 rounded-full bg-[var(--accent)]/85"
                          style={{ width: `${dim.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Why candidates love TigerHire
              </p>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">Less guessing.</span>{" "}
                <span className="text-white">More momentum.</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <MessageSquare size={18} />,
                title: "WhatsApp-first",
                body: "Apply in chat where you already respond, without long portal loops.",
              },
              {
                icon: <Sparkles size={18} />,
                title: "Transparent fit",
                body: "See what matched and what to improve instead of a silent rejection.",
              },
              {
                icon: <CheckCircle2 size={18} />,
                title: "Faster replies",
                body: "Recruiters review candidates on one agreed standard, so decisions move sooner.",
              },
            ].map((item, index) => (
              <ScrollReveal key={item.title} delay={index * 90} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="heading-display text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">Browse roles that match</span>{" "}
                <span className="text-white">your profile</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { title: "Product & Engineering", blurb: "Build, ship, and scale — dev to data." },
              { title: "Operations & Support", blurb: "Keep teams and customers running." },
              { title: "Finance & Business Roles", blurb: "From analysts to business leads." },
            ].map((item) => (
              <Link
                key={item.title}
                href="/jobs"
                className="card-lifted-marketing card-lifted-marketing-hover block p-6"
              >
                <p className="text-base font-extrabold text-white">{item.title}</p>
                <p className="mt-2 text-sm text-white/55">{item.blurb}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden py-32">
          <div
            className="mesh-orb mesh-orb-2 left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 bg-amber-500/[0.06]"
            aria-hidden
          />
          <ScrollReveal>
            <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
              <h2 className="heading-display text-4xl md:text-6xl">
                <span className="heading-display-light text-white/60">Ready to get</span>{" "}
                <span className="text-white">matched?</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">
                Drop your CV once and see where you fit across open roles.
              </p>
              <div className="mt-8 flex items-center justify-center">
                <a
                  href={whatsappApplyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cta-bloom-lg group inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  <MessageCircle size={16} className="text-emerald-700" />
                  Drop your CV
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </a>
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
