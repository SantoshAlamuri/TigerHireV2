import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FileText,
  MessageSquare,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
} from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "For Agencies",
  description: `${SITE_MARKETING.brand} for agencies — defensible shortlists with role-specific scoring, client-approved ideal profiles, and market intelligence. ${SITE_MARKETING.tagline}.`,
  keywords: [
    "recruitment agency software",
    "staffing agency ai",
    "candidate scoring for agencies",
    "hiring intelligence agencies",
    "recruiter agency tools india",
    "defensible shortlists",
  ],
  alternates: {
    canonical: "/agencies",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} for Agencies | Defensible shortlists`,
    description: SITE_MARKETING.descriptionShort,
    url: "https://tigerhire.io/agencies",
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
    title: `${SITE_MARKETING.brand} for Agencies`,
    description: SITE_MARKETING.descriptionShort,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

export default function AgenciesPage() {
  return (
    <PublicPageWrapper>
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
              For agencies
            </span>
            <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl animate-fade-up animate-fade-up-2">
              <span className="heading-display-light text-white/55">
                Score candidates your clients will
              </span>
              <br />
              <span className="text-white">actually hire.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl animate-fade-up animate-fade-up-3">
              You know the client&apos;s needs better than their JD does. Define the scoring
              criteria, lock client approval up front, and submit against one approved bar.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up animate-fade-up-4">
              <Link
                href="/contact"
                className="cta-bloom-lg group inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Talk to sales
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/product#talent-intelligence"
                className="rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                Review scoring framework
              </Link>
            </div>
          </div>
        </section>

        {/* ═══ The Agency Workflow ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              The agency workflow
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">
                From JD to a shortlist your
              </span>{" "}
              <span className="text-white">client will trust</span>
            </h2>
          </ScrollReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              {
                step: "01",
                icon: <FileText size={20} />,
                title: "Receive the JD",
                description:
                  "Generate a role-specific decision baseline from the JD for client review.",
              },
              {
                step: "02",
                icon: <SlidersHorizontal size={20} />,
                title: "Refine it",
                description:
                  "Adjust weighted criteria and ideal profile to reflect the actual client brief, not generic language.",
              },
              {
                step: "03",
                icon: <Send size={20} />,
                title: "Get client approval",
                description:
                  "Secure client sign-off on standards before scoring so review cycles stay aligned.",
              },
              {
                step: "04",
                icon: <Target size={20} />,
                title: "Score every candidate",
                description:
                  "Deliver ranked shortlists with rationale your client can review and defend.",
              },
              {
                step: "05",
                icon: <ShieldCheck size={20} />,
                title: "Defend every submission",
                description:
                  "Use shared evidence to answer shortlist challenges without opinion-led debate.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 80}>
                <div className="card-lifted-marketing flex items-start gap-5 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--accent)]">
                        STEP {item.step}
                      </span>
                      <h3 className="heading-card text-base text-white">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{item.description}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ Defensible shortlists ═══ */}
        <ScrollReveal>
          <section className="mx-auto max-w-4xl px-5 py-24 lg:px-8">
            <div className="card-lifted-marketing alive-halo-lg p-8 md:p-10">
              <h2 className="heading-display text-4xl md:text-5xl">
                <span className="heading-display-light text-white/60">No more</span>{" "}
                <span className="text-white">&ldquo;why did you send me this CV?&rdquo;</span>
              </h2>
              <h3 className="sr-only">No more &ldquo;why did you send me this CV?&rdquo;</h3>
              <p className="mt-4 text-lg leading-relaxed text-white/70">
                When you submit through TigerHire, the client sees the same structured decision
                readout you do. You can justify every submission without side decks or subjective
                interpretation.
              </p>
              <p className="mt-5 text-sm leading-relaxed text-white/45">
                Curious how scores, ideal match, and market rank fit together?{" "}
                <Link
                  href="/product#talent-intelligence"
                  className="font-semibold text-white/75 hover:text-white"
                >
                  Read the full product breakdown
                </Link>
                .
              </p>
              <div className="mt-6">
                <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-white/45">
                  Sample scorecard
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <div className="card-lifted-marketing p-4 text-center">
                    <p className="heading-display text-3xl tabular-nums text-[var(--accent)]">78</p>
                    <p className="mt-1 text-xs text-white/55">FitScore vs role</p>
                  </div>
                  <div className="card-lifted-marketing p-4 text-center">
                    <p className="heading-display text-3xl tabular-nums text-purple-300">62%</p>
                    <p className="mt-1 text-xs text-white/55">vs client&apos;s ideal</p>
                  </div>
                  <div className="card-lifted-marketing p-4 text-center">
                    <p className="heading-display text-3xl tabular-nums text-emerald-300">
                      Top 12%
                    </p>
                    <p className="mt-1 text-xs text-white/55">market percentile</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-white/45">
                  Illustrative numbers. Every submission carries the same structure so clients
                  compare apples to apples.
                </p>
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* ═══ Candidate supply: WhatsApp + Refer & Earn ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Candidate supply
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">
                Recruiters spend more time placing,
              </span>{" "}
              <span className="text-white">less time chasing</span>
            </h2>
            <p className="mt-4 max-w-2xl text-xl leading-relaxed text-white/70">
              Candidates engage on WhatsApp, where reply rates beat email and portals. Refer &amp;
              Earn turns your bench, alumni, and contacts into a referral pipeline — every link
              role-specific, every referral tracked back to the source. Recruiters review ranked
              candidates instead of triaging inboxes.
            </p>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <MessageSquare size={18} />,
                title: "WhatsApp-first apply",
                desc: "Candidates respond on chat, not portals. Higher reply rates and faster shortlists for client-driven roles.",
              },
              {
                icon: <Share2 size={18} />,
                title: "Refer & Earn for your network",
                desc: "Your bench and contacts share role-specific links. Each referral is tracked back to the source — credit stays clear.",
              },
              {
                icon: <Target size={18} />,
                title: "Pre-scored on arrival",
                desc: "Every applicant — referred or direct — lands with a role-specific score. Recruiters review, not triage.",
              },
            ].map((item, index) => (
              <ScrollReveal key={item.title} delay={index * 90} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal delay={350}>
            <p className="mt-6 text-sm text-white/45">
              See the candidate side:{" "}
              <Link href="/refer" className="font-semibold text-white/75 hover:text-white">
                how Refer &amp; Earn works
              </Link>
              .
            </p>
          </ScrollReveal>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Built for agency workflows
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Protect delivery quality,</span>{" "}
              <span className="text-white">submission after submission</span>
            </h2>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <BadgeCheck size={18} />,
                title: "One rubric per role",
                desc: "Agree the bar with the client once. Every recruiter on your bench screens against the same criteria — no freelance interpretation.",
              },
              {
                icon: <Users size={18} />,
                title: "Defendable at any volume",
                desc: "Every CV you submit comes with a structured rationale. Fewer 'why this one?' emails, fewer shortlist reopens.",
              },
              {
                icon: <ShieldCheck size={18} />,
                title: "Client-ready handoffs",
                desc: "Share the same scorecard the client sees. No side decks, no redaction theatre, no lost credibility.",
              },
            ].map((item, index) => (
              <ScrollReveal key={item.title} delay={index * 90} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="card-lifted-marketing p-8">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Agency-friendly pricing
              </p>
              <p className="mt-3 text-lg leading-relaxed text-white/70">
                Pricing scales by workflow depth and support needs, with commercial terms aligned to
                how agencies actually operate.
              </p>
              <Link
                href="/pricing"
                className="mt-6 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                Review agency-friendly pricing
                <ArrowRight size={14} />
              </Link>
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="relative overflow-hidden py-32">
          <div
            className="mesh-orb mesh-orb-2 left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 bg-amber-500/[0.06]"
            aria-hidden
          />
          <ScrollReveal>
            <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
              <h2 className="heading-display text-4xl md:text-6xl">
                <span className="heading-display-light text-white/60">Make every shortlist</span>{" "}
                <span className="text-white">defensible.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/70">
                Put client-approved criteria in front of every submission, then walk into reviews
                with evidence — not opinions. Bring a live role and see the workflow end to end.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center">
                <Link
                  href="/contact"
                  className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Talk to sales
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
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
