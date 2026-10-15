import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileText,
  LineChart,
  Lock,
  MessageSquare,
  Share2,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "For Companies — CHROs & Talent Leaders",
  description: `${SITE_MARKETING.brand} for in-house talent teams and CHROs: hiring-manager-approved criteria, explainable scoring, and evidence your board and line leaders can trust. ${SITE_MARKETING.tagline}.`,
  keywords: [
    "CHRO hiring software india",
    "talent acquisition platform",
    "explainable ai recruiting",
    "hiring governance talent team",
    "hm approved scoring criteria",
    "enterprise hiring intelligence",
  ],
  alternates: {
    canonical: "/companies",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} for Companies | CHROs & talent leaders`,
    description: SITE_MARKETING.descriptionShort,
    url: "https://tigerhire.io/companies",
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
    title: `${SITE_MARKETING.brand} for Companies`,
    description: SITE_MARKETING.descriptionShort,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

export default function CompaniesPage() {
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
              For CHROs &amp; talent leaders
            </span>
            <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl animate-fade-up animate-fade-up-2">
              <span className="heading-display-light text-white/55">
                Give your organisation one
              </span>
              <br />
              <span className="text-white">defensible standard for who gets interviewed.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl animate-fade-up animate-fade-up-3">
              Set the bar before screening starts. Every candidate is judged against one explainable
              framework — so TA and leadership move faster without giving up rigour.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up animate-fade-up-4">
              <Link
                href="/contact"
                className="cta-bloom-lg group inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Book walkthrough
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/product"
                className="rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        {/* ═══ CHRO / talent narrative ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <p className="mx-auto max-w-3xl text-center text-lg leading-relaxed text-white/55">
              Boards want hiring that&apos;s fast and disciplined. Black-box matching can&apos;t
              survive a review. What holds up: approved criteria, explainable outcomes, and a single
              operating picture that doesn&apos;t ride on one recruiter&apos;s judgment.
            </p>
          </ScrollReveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              "Black-box matching can&apos;t survive a review.",
              "Subjective interview loops create downstream misalignment.",
              "Operating picture doesn&apos;t ride on one recruiter&apos;s judgment.",
            ].map((pain, index) => (
              <ScrollReveal key={pain} delay={index * 90} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <p className="text-base font-extrabold text-white/75">Hiring chaos today</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{pain}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal delay={280}>
            <div className="card-lifted-marketing mt-6 border-l-4 border-l-[var(--accent)]/40 p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                TigerHire answer
              </p>
              <p className="mt-3 text-lg leading-relaxed text-white/70">
                Approved criteria, explainable outcomes, and one operating rhythm from intake to
                final verdict.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ In-house workflow ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              How talent teams run it
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">From approved criteria to</span>{" "}
              <span className="text-white">confident shortlists</span>
            </h2>
          </ScrollReveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              {
                step: "01",
                icon: <FileText size={20} />,
                title: "Publish the role",
                description:
                  "Create or paste the JD. TigerHire builds a role-specific evaluation baseline tied to business priorities.",
              },
              {
                step: "02",
                icon: <UserCheck size={20} />,
                title: "Hiring manager locks the bar",
                description:
                  "The HM approves criteria and ideal profile before scoring starts, preventing late-stage alignment failures.",
              },
              {
                step: "03",
                icon: <Users size={20} />,
                title: "Screen with one standard",
                description:
                  "Every applicant gets the same structured evaluation and plain-language rationale against the approved standard.",
              },
              {
                step: "04",
                icon: <LineChart size={20} />,
                title: "Review with evidence",
                description:
                  "Pipeline reviews run on shared signals instead of fragmented spreadsheets or opinion-based escalation.",
              },
              {
                step: "05",
                icon: <ShieldCheck size={20} />,
                title: "Run hiring end-to-end",
                description:
                  "Run pipeline, interviews, assessments, and approvals in one governed system with audit-ready handoffs.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 80}>
                <div className="card-lifted-marketing alive-halo-lg flex items-start gap-5 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
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

          <ScrollReveal delay={450}>
            <p className="mt-8 text-center text-sm text-white/45">
              ATS depth, WhatsApp-first candidate journeys, enterprise SSO, and market context —{" "}
              <Link href="/product" className="font-semibold text-white/75 hover:text-white">
                see the full product page
              </Link>
              .
            </p>
          </ScrollReveal>
        </section>

        {/* ═══ What leadership gets ═══ */}
        <ScrollReveal>
          <section className="mx-auto max-w-4xl px-5 py-24 lg:px-8">
            <div className="card-lifted-marketing border-l-4 border-l-[var(--accent)]/40 p-8 md:p-10">
              <h2 className="heading-display text-4xl md:text-5xl">
                <span className="heading-display-light text-white/60">What CHROs and heads of</span>{" "}
                <span className="text-white">talent get</span>
              </h2>
              <h3 className="sr-only">What CHROs and heads of talent get</h3>
              <ul className="mt-6 space-y-4 text-sm leading-relaxed text-white/55 md:text-[0.95rem]">
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 font-semibold text-[var(--accent)]">—</span>
                  <span>
                    <strong className="text-white">Aligned bar:</strong> HMs commit to criteria
                    before screening — fewer escalations and fewer &ldquo;that wasn&apos;t what we
                    meant&rdquo; moments.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 font-semibold text-[var(--accent)]">—</span>
                  <span>
                    <strong className="text-white">Explainable decisions:</strong> Verdicts and
                    reasoning your team can repeat to leadership without apologising for a black
                    box.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 font-semibold text-[var(--accent)]">—</span>
                  <span>
                    <strong className="text-white">Operating rhythm:</strong> One place for intake,
                    evidence, pipeline, and handoffs — so TA scales without losing governance.
                  </span>
                </li>
              </ul>
              <p className="mt-6 text-sm text-white/45">
                Want the technical view on scoring layers, market intelligence, and how we compare
                to other tools?{" "}
                <Link
                  href="/product#talent-intelligence"
                  className="font-semibold text-white/75 hover:text-white"
                >
                  Read Talent Intelligence on the product page
                </Link>
                .
              </p>
            </div>
          </section>
        </ScrollReveal>

        {/* ═══ Pipeline supply: WhatsApp + Refer & Earn ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Pipeline supply
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">
                Quality candidates show up
              </span>{" "}
              <span className="text-white">without the sourcing grind</span>
            </h2>
            <p className="mt-4 max-w-2xl text-xl leading-relaxed text-white/70">
              WhatsApp-native applications meet candidates where they actually reply. Refer &amp;
              Earn turns your employees and network into a tracked referral pipeline. Whichever door
              a candidate came through, the same approved bar judges them all.
            </p>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <MessageSquare size={18} />,
                title: "WhatsApp-first apply",
                desc: "Candidates drop a CV in chat, see how they fit, and pick interview slots — without bouncing through a careers portal.",
              },
              {
                icon: <Share2 size={18} />,
                title: "Refer & Earn, built in",
                desc: "Employees and external referrers share role-specific links. Every referral is tracked, scored, and credited back automatically.",
              },
              {
                icon: <BadgeCheck size={18} />,
                title: "Same bar, every source",
                desc: "WhatsApp, apply link, board URL, or referral — every candidate lands in the same pipeline against the approved standard.",
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
              Governance &amp; trust
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">
                The controls your security and
              </span>{" "}
              <span className="text-white">legal teams already ask for</span>
            </h2>
          </ScrollReveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <Lock size={18} />,
                title: "Enterprise identity, out of the box",
                desc: "Microsoft OAuth, domain controls, and a 2FA policy foundation. Your recruiters sign in the same way the rest of the company does.",
              },
              {
                icon: <ShieldCheck size={18} />,
                title: "Audit-ready by default",
                desc: "Every verdict, approval, and stage change is logged. DSR, retention, and access exports ship in the product — not as a project.",
              },
              {
                icon: <Activity size={18} />,
                title: "Predictable at scale",
                desc: "One operating view across roles, recruiters, and business units. Slippage shows up on a dashboard, not in a post-mortem.",
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
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { value: "1", label: "approved bar per role" },
                { value: "5", label: "governed workflow stages" },
                { value: "100%", label: "scored against one rubric" },
                { value: "0", label: "black-box handoffs" },
              ].map((item) => (
                <div key={item.label} className="card-lifted-marketing p-6 text-center">
                  <p className="heading-display tabular-nums text-5xl text-white">{item.value}</p>
                  <p className="mt-2 text-sm text-white/55">{item.label}</p>
                </div>
              ))}
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
                <span className="heading-display-light text-white/60">
                  Standardise hiring quality
                </span>{" "}
                <span className="text-white">without the drama.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-white/70">
                Walk through criteria governance, explainable verdicts, and implementation fit with
                your existing hiring process.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center">
                <Link
                  href="/contact"
                  className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Book walkthrough
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
