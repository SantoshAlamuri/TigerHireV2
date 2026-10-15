import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, Eye, Zap, Users, Target, Shield, MapPin } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "About",
  description: `Meet the team behind ${SITE_MARKETING.brand} — ${SITE_MARKETING.tagline}. Mission, values, and why we built explainable hiring verdicts for global teams.`,
  keywords: [
    "about tigerhire",
    "hiring intelligence company",
    "talent intelligence founder",
    "whatsapp hiring",
  ],
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: `About ${SITE_MARKETING.brand}`,
    description: `Built by an HR leader who lived the problem. ${SITE_MARKETING.tagline} — verdicts, not just scores.`,
    url: "https://tigerhire.io/about",
    siteName: SITE_MARKETING.brand,
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
    title: `About ${SITE_MARKETING.brand}`,
    description: SITE_MARKETING.descriptionShort,
    images: ["https://tigerhire.io/og.png"],
  },
};

const VALUES = [
  {
    icon: <Eye size={20} />,
    title: "Transparency first",
    desc: "Every score is explainable. No black boxes. Both sides see exactly why a match is a match.",
  },
  {
    icon: <Shield size={20} />,
    title: "Bias-reduced by design",
    desc: "We score on skills, experience, and fit — not names, photos, or pedigree. The system is auditable.",
  },
  {
    icon: <Users size={20} />,
    title: "Both sides win",
    desc: "A platform only works if both sides get value. Companies hire faster. Candidates get seen.",
  },
  {
    icon: <Zap size={20} />,
    title: "Speed without shortcuts",
    desc: "Fast ranking without hiding the reasoning. Every score comes with a full breakdown — no speed at the cost of quality.",
  },
  {
    icon: <Heart size={20} />,
    title: "Built with care",
    desc: "We know what bad hiring feels like. Every feature is designed with empathy for both the recruiter and the candidate.",
  },
  {
    icon: <Target size={20} />,
    title: "Global by design",
    desc: "Built for how hiring actually works: candidates on WhatsApp where that channel fits; teams in the browser with one auditable workflow. Privacy-first and pricing that scales with you.",
  },
];

const MILESTONES = [
  { date: "2024", label: "Problem identified. Research begins." },
  { date: "Q3 2025", label: "First Talent Intelligence prototype tested internally." },
  { date: "Q4 2025", label: "ATS, pipeline, and WhatsApp hiring flows built." },
  {
    date: "Q1 2026",
    label:
      "Talent Intelligence System launched — three-layer scoring with verdicts, ideal profiles, and market intelligence.",
  },
  { date: "Q1 2026", label: "Pilot deployments with hiring teams." },
  { date: "16 Apr 2026", label: "Public launch.", highlight: true },
  { date: "H2 2026", label: "Regional go-to-market expansion." },
];

const ABOUT_FAQ = [
  {
    q: "What is TigerHire?",
    a: "A global hiring intelligence platform. We score candidates for the role, compare them to your ideal hire and the market, and give a clear verdict — interview, shortlist, or pass — with every score explained.",
  },
  {
    q: "How is TigerHire different from other AI hiring tools?",
    a: "Most tools stop at a match percentage. TigerHire combines HM-approved FitScore (role fit), ideal-profile match, and market position when your pool is large enough — into one verdict, explained in plain English.",
  },
  {
    q: "How does scoring work?",
    a: "121 role templates across 20 industries and 492 weighted criteria. The JD Intelligence agent extends that library from each job's title and description; your hiring manager approves the rubric before anyone is scored.",
  },
  {
    q: "What is a hiring verdict?",
    a: "Labels such as Strong Hire, Safe Hire, Hidden Gem, Niche Talent, or Pass — from FitScore, ideal match, and market position when enough data exists. While percentiles are still building, you may see Good Fit or Moderate. Each comes with a short explanation.",
  },
  {
    q: "Does TigerHire support agencies?",
    a: "Yes. Define criteria, get client sign-off on the ideal profile, score candidates, and defend every submission with the same breakdown your client sees.",
  },
] as const;

const aboutFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ABOUT_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function AboutPage() {
  return (
    <PublicPageWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutFaqSchema) }}
      />
      <PublicNav />
      <main className="alive-air-hero relative z-10">
        {/* ═══ Hero ═══ */}
        <section className="relative overflow-hidden px-5 py-32 lg:px-8 lg:py-40">
          <div
            className="mesh-orb mesh-orb-1 left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 bg-amber-500/[0.05]"
            aria-hidden
          />
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/75 animate-fade-up animate-fade-up-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Remote-first · global team
            </span>
            <h1 className="heading-display mt-6 text-4xl md:text-6xl lg:text-7xl animate-fade-up animate-fade-up-2">
              <span className="heading-display-light text-white/55">Built by someone who</span>{" "}
              <span className="text-white">lived the problem.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/65 md:text-2xl animate-fade-up animate-fade-up-3">
              TigerHire wasn&apos;t born in a boardroom. It was born from years of seeing the same
              broken loops — on both sides of the hiring table.
            </p>
            <Link
              href="/product"
              className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-white/65 transition hover:text-white animate-fade-up animate-fade-up-4"
            >
              See how it works <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* ═══ Founder Story ═══ */}
        <section className="mx-auto max-w-5xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="grid items-start gap-12 md:grid-cols-[1fr_2fr]">
              <div className="flex flex-col items-center md:items-start">
                <div className="card-lifted-marketing flex h-28 w-28 items-center justify-center">
                  <span className="heading-hero text-4xl text-[var(--accent)]">S</span>
                </div>
                <h3 className="heading-card mt-4 text-xl text-white">Sam</h3>
                <p className="mt-1 text-sm text-white/55">Founder & CEO</p>
                <p className="mt-0.5 text-xs text-white/45">HR leader turned builder</p>
              </div>

              <div className="space-y-5 text-lg leading-relaxed text-white/70">
                <p>
                  I spent years leading HR teams at growing companies around the world. I&apos;ve
                  screened thousands of CVs, written hundreds of job descriptions, and made more
                  hiring decisions than I can count.
                </p>
                <p>
                  Every time, I saw the same pattern: recruiters drowning in applications they
                  couldn&apos;t process fast enough, and candidates sending CVs into a void, never
                  knowing where they stood. The tools were expensive, the data was stale, and the
                  matching was entirely manual.
                </p>
                <p>
                  I knew there had to be a better way. Not just a smarter ATS — but a platform that
                  meets people where they already are. In many markets that&apos;s WhatsApp;
                  elsewhere it&apos;s the web — either way, candidates drop a CV, get scored as
                  processing completes, and move forward without portal friction. Recruiters get a
                  ranked shortlist with explanations, not a pile of PDFs.
                </p>
                <p className="text-white">
                  That&apos;s TigerHire. Messaging-friendly candidate flows, web workflows for your
                  team, JD Intelligence and FitScore-backed verdicts, and a hiring workflow ATS —
                  built for how global teams actually hire.
                </p>
                <p className="mt-5 text-white/70">
                  We started by building an ATS with AI scoring. Then we realised scoring alone
                  isn&apos;t enough. Recruiters don&apos;t need a number — they need a decision they
                  can defend. So we built a hiring intelligence platform: three layers of scoring, a
                  verdict engine, and full explainability for every candidate.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ Mission ═══ */}
        <ScrollReveal>
          <section className="mx-auto max-w-4xl px-5 py-24 lg:px-8">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Our mission
              </span>
              <h2 className="heading-display mt-4 text-4xl md:text-5xl">
                <span className="heading-display-light text-white/60">Make every hire</span>{" "}
                <span className="text-white">the right hire.</span>
              </h2>
              <p className="mt-4 max-w-3xl text-xl leading-relaxed text-white/70">
                By building an intelligent hiring platform where companies hire faster and
                candidates never feel invisible — powered by AI that explains every decision.
              </p>
            </div>
          </section>
        </ScrollReveal>

        {/* ═══ Values ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              What we believe
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Our</span>{" "}
              <span className="text-white">principles</span>
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((val, i) => (
              <ScrollReveal key={val.title} delay={i * 80} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                    {val.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{val.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{val.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ Timeline ═══ */}
        <section className="mx-auto max-w-3xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              The journey
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Where we&apos;ve been.</span>{" "}
              <span className="text-white">Where we&apos;re going.</span>
            </h2>
          </ScrollReveal>

          <div className="relative mt-8 pl-8">
            <div
              className="absolute bottom-0 left-3 top-0 w-px bg-gradient-to-b from-[var(--accent)]/30 via-white/10 to-transparent"
              aria-hidden
            />

            <div className="space-y-8">
              {MILESTONES.map((ms, i) => (
                <ScrollReveal key={i} delay={i * 80}>
                  <div className="relative flex items-start gap-5">
                    <div
                      className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full border-2 ${
                        ms.highlight
                          ? "border-[var(--accent)] bg-[var(--accent)]"
                          : "border-white/30 bg-transparent"
                      }`}
                      aria-hidden
                    />
                    <div>
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${
                          ms.highlight ? "text-[var(--accent)]" : "text-white/45"
                        }`}
                      >
                        {ms.date}
                      </span>
                      <p
                        className={`mt-1 text-sm ${
                          ms.highlight ? "font-semibold text-white" : "text-white/55"
                        }`}
                      >
                        {ms.label}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ FAQs ═══ */}
        <section id="faqs" className="mx-auto max-w-4xl scroll-mt-28 px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                FAQs
              </span>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">Common</span>{" "}
                <span className="text-white">questions</span>
              </h2>
            </div>
          </ScrollReveal>
          <div className="mt-8 space-y-3">
            {ABOUT_FAQ.map((item) => (
              <div key={item.q} className="card-lifted-marketing p-6">
                <h3 className="heading-card text-sm text-white">{item.q}</h3>
                <p className="mt-1.5 text-[0.85rem] leading-relaxed text-white/65">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="relative overflow-hidden py-24">
          <ScrollReveal>
            <div className="relative mx-auto max-w-3xl px-5 text-center lg:px-8">
              <h2 className="heading-display text-4xl md:text-5xl">Join us in fixing hiring.</h2>
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/70">
                Whether you&apos;re a company looking for the right people, or a candidate looking
                for the right role — we built TigerHire for you.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="cta-bloom group flex items-center gap-2 rounded-md bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Open app
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <Link
                  href="/contact"
                  className="rounded-md border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  Talk to us
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
