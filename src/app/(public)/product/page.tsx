import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  MessageSquare,
  Target,
  ArrowRight,
  Eye,
  Users,
  Kanban,
  CalendarCheck,
  ClipboardCheck,
  UserPlus,
  BarChart3,
  MessageCircle,
  TrendingUp,
  Building2,
  ShieldCheck,
  DollarSign,
} from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import JdIntelligenceAgentSection from "@/components/marketing/JdIntelligenceAgentSection";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";
import { PRODUCT_VS_OTHERS_ROWS } from "@/lib/marketing/product-comparison";

const FitScoreCardMock = dynamic(() => import("@/components/marketing/FitScoreCardMock"), {
  loading: () => <div className="card-lifted-marketing h-80 animate-pulse" />,
});

export const metadata: Metadata = {
  title: "Product — Hiring Decision Intelligence",
  description: `${SITE_MARKETING.brand}: turn every applicant into a defensible shortlist with hiring-manager-approved rubrics, evidence-backed FitScore, and outcome learning.`,
  keywords: [
    "hiring intelligence platform",
    "role-specific scoring",
    "talent intelligence",
    "ai hiring verdict",
    "ideal profile matching",
    "market position hiring",
    "whatsapp recruitment software",
    "global hiring software",
    "JD intelligence agent",
    "AI job description rubric",
  ],
  alternates: {
    canonical: "/product",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} Product | Hiring Decision Intelligence`,
    description:
      "Turn every applicant into a defensible shortlist with approved rubrics, evidence-backed verdicts, and hiring-outcome feedback.",
    url: "https://tigerhire.io/product",
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
    title: `${SITE_MARKETING.brand} Product | Hiring Decision Intelligence`,
    description:
      "Approved hiring bars, evidence-backed shortlists, and outcome learning for high-volume recruitment.",
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

export default function ProductPage() {
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TigerHire",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://tigerhire.io/product",
    description: SITE_MARKETING.description,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <PublicPageWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
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
            <div className="animate-fade-up animate-fade-up-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/75">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Hiring Decision Intelligence
              </span>
            </div>
            <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl animate-fade-up animate-fade-up-2">
              <span className="heading-display-light text-white/55">Every applicant.</span>
              <br />
              <span className="text-white">One defensible shortlist.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/65 md:text-2xl animate-fade-up animate-fade-up-3">
              Turn 500 CVs into the 10 worth interviewing using a hiring-manager-approved bar,
              criterion-level evidence, and verdicts your team can challenge before acting.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-white/55 animate-fade-up animate-fade-up-3">
              WhatsApp, web apply, email intake, referrals, and job-board applicants all land in the
              same scored queue; ATS execution supports the decision rather than burying it.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up animate-fade-up-4">
              <Link
                href="/contact"
                className="cta-bloom-lg group inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition duration-200 hover:scale-[1.02] hover:bg-[var(--accent-hover)]"
              >
                Prove it on one role
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                See the decision flow
              </Link>
            </div>
          </div>
        </section>

        <JdIntelligenceAgentSection
          variant="public"
          footerLink={{
            href: "#how-it-works",
            label: "Next: the five-step flow",
          }}
        />

        {/* ═══ How it Works — with HM Approval Gate ═══ */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 lg:px-8">
          <ScrollReveal>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              How it works
            </p>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Five steps from</span>{" "}
              <span className="text-white">role brief to shortlist</span>
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-5">
            {[
              {
                step: "01",
                title: "Capture the brief",
                desc: "Convert the JD and business need into a role-specific evaluation baseline.",
              },
              {
                step: "02",
                title: "Set the bar",
                desc: "Lock weighted dimensions, must-haves, trainable gaps, and knockout conditions.",
              },
              {
                step: "03",
                title: "HM reviews & approves",
                desc: "Approve the decision bar before candidates are scored or compared.",
              },
              {
                step: "04",
                title: "Candidates scored",
                desc: "Rank every applicant with evidence for, gaps, confidence, and verification probes.",
              },
              {
                step: "05",
                title: "Prove the shortlist",
                desc: "Compare candidates, record decisions, and feed outcomes back into future scoring.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 80} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/10 heading-card text-xs text-[var(--accent)]">
                    {item.step}
                  </span>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ WhatsApp-First Hiring ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              WhatsApp for candidates
            </p>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Hire where candidates</span>{" "}
              <span className="text-white">already chat</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70">
              Chat for CV drop, nudges, and replies; pipeline and approvals stay in the web app.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <MessageSquare size={20} />,
                title: "Guided CV intake",
                desc: "Candidates submit CVs in chat and enter scoring with structured, role-mapped profiles.",
              },
              {
                icon: <Target size={20} />,
                title: "Priority match delivery",
                desc: "Share high-priority role matches with score context to improve candidate conversion.",
              },
              {
                icon: <MessageCircle size={20} />,
                title: "Frictionless apply",
                desc: "One-reply applications reduce drop-off and accelerate movement into qualified pipeline.",
              },
              {
                icon: <CalendarCheck size={20} />,
                title: "Coordinated scheduling",
                desc: "Handle slot selection and reminders in chat while interview governance stays in ATS.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 80} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={400}>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <UserPlus size={18} />,
                  title: "Referral capture",
                  desc: "Capture referrals in chat and route them into governed candidate workflows.",
                },
                {
                  icon: <Users size={18} />,
                  title: "Structured vouch signals",
                  desc: "Capture references in structured, timestamped format linked to each candidate record.",
                },
                {
                  icon: <ShieldCheck size={18} />,
                  title: "Consent governance",
                  desc: "Enforce explicit consent before CV processing to keep intake policy-aligned.",
                },
              ].map((item) => (
                <div key={item.title} className="card-lifted-marketing flex items-start gap-3 p-6">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ Talent Intelligence — Three-Layer Story ═══ */}
        <section id="talent-intelligence" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              TigerHire Talent Intelligence
            </p>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">
                Other platforms tell you who matches the JD.
              </span>
              <br />
              <span className="text-white">TigerHire tells you who to hire.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
              These three signals converge into one decision label with rationale leaders can review
              and defend.
            </p>
          </ScrollReveal>

          {/* Three layers */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ScrollReveal delay={100} className="h-full">
              <div className="card-lifted-marketing relative h-full overflow-hidden p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                  <Target size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
                  Layer 1
                </p>
                <h3 className="heading-card mt-2 text-lg text-white">FitScore</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  How well does this CV match <em>this</em> job? Dimensions and weights come from
                  the rubric your hiring manager approved — not a black-box keyword count.
                </p>
                <p className="mt-3 text-xs font-medium text-[var(--accent)]">0 – 100 role match</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200} className="h-full">
              <div className="card-lifted-marketing relative h-full overflow-hidden p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-purple-500/10 text-purple-300 ring-1 ring-inset ring-purple-300/20">
                  <Users size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-purple-300">
                  Layer 2
                </p>
                <h3 className="heading-card mt-2 text-lg text-white">Ideal Profile Match</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  How close are they to your ideal hire? Must-haves, deal-breakers, and the skills
                  that separate good from great — compared on the same bar everyone agreed to.
                </p>
                <p className="mt-3 text-xs font-medium text-purple-300">% match vs. ideal</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={300} className="h-full">
              <div className="card-lifted-marketing relative h-full overflow-hidden p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                  <TrendingUp size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  Layer 3
                </p>
                <h3 className="heading-card mt-2 text-lg text-white">Market position</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  When enough candidates exist in the same role category, we show how rare this
                  profile is (e.g. Top 5% vs more common). If the pool is still building, we lean on
                  FitScore and ideal match first — then market context catches up.
                </p>
                <p className="mt-3 text-xs font-medium text-emerald-300">
                  Market percentile when data is sufficient
                </p>
              </div>
            </ScrollReveal>
          </div>

          {/* Verdict callout */}
          <ScrollReveal delay={400}>
            <div className="card-lifted-marketing mt-8 p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                  <Eye size={22} />
                </div>
                <div>
                  <h3 className="heading-card text-lg text-white">
                    Executive verdict — one label, three signals
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-white/55">
                    Labels include <strong className="text-emerald-400">Strong Hire</strong>,{" "}
                    <strong className="text-blue-400">Safe Hire</strong>,{" "}
                    <strong className="text-amber-400">Hidden Gem</strong>,{" "}
                    <strong className="text-amber-400">Niche Talent</strong>,{" "}
                    <strong className="text-red-400">Pass</strong>. Until pool percentiles are
                    ready: <strong className="text-[var(--text)]">Good Fit</strong> /{" "}
                    <strong className="text-[var(--text)]">Moderate</strong>. Every verdict includes
                    confidence banding, CV quote evidence, and dimension-level context.
                  </p>
                  <Link
                    href="/contact"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                  >
                    Review this in a live walkthrough <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Role-specific scoring intelligence */}
          <div className="mt-10">
            <ScrollReveal>
              <h3 className="heading-card text-lg text-white">
                Role-specific scoring intelligence
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-white/55">
                <strong className="font-semibold text-white">121 role templates</strong> ·{" "}
                <strong className="font-semibold text-white">20 industries</strong> ·{" "}
                <strong className="font-semibold text-white">492 weighted criteria</strong>. The
                agent extends the library per job; examples below.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    role: "Technical Scrum Master",
                    dims: [
                      "Delivery Governance",
                      "Technical Acumen",
                      "Risk Management",
                      "Stakeholder Communication",
                    ],
                  },
                  {
                    role: "UX Designer",
                    dims: [
                      "Accessibility",
                      "Component Design",
                      "User Research",
                      "Collaboration & Handoff",
                    ],
                  },
                  {
                    role: "Chartered Accountant",
                    dims: ["IFRS reporting", "Tax compliance", "Audit & assurance", "Advisory"],
                  },
                ].map((example) => (
                  <div key={example.role} className="card-lifted-marketing p-6">
                    <p className="text-sm font-semibold text-white">{example.role}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {example.dims.map((d) => (
                        <span
                          key={d}
                          className="rounded-md border border-[var(--accent)]/15 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>

          {/* Live card */}
          <ScrollReveal delay={300}>
            <div className="mt-10">
              <FitScoreCardMock />
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ TigerHire vs other tools ═══ */}
        <section id="comparison" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                TigerHire vs other tools
              </span>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">What others miss,</span>{" "}
                <span className="text-white">we solve</span>
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="card-lifted-marketing border-l-4 border-l-[var(--accent)]/40 p-6 md:p-8">
                <h3 className="heading-card text-base font-extrabold text-white">
                  TigerHire approach
                </h3>
                <div className="mt-4 space-y-3">
                  {PRODUCT_VS_OTHERS_ROWS.map((row) => (
                    <div key={`${row.feature}-th`}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                        {row.feature}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-white/75">{row.th}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-lifted-marketing p-6 md:p-8">
                <h3 className="heading-card text-base font-extrabold text-white/70">
                  Old approach
                </h3>
                <div className="mt-4 space-y-3">
                  {PRODUCT_VS_OTHERS_ROWS.map((row) => (
                    <div key={`${row.feature}-other`}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                        {row.feature}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-white/55">{row.other}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ Built-in ATS ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Applicant tracking system
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">A hiring workflow ATS.</span>{" "}
              <span className="text-white">Not an afterthought.</span>
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70">
              Scoring is the start, not the finish. TigerHire carries teams from approved criteria
              to signed offer — pipeline, interviews, feedback, and governance in one workflow.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <Kanban size={20} />,
                title: "Pipeline Management",
                desc: "Kanban board with configurable stages per job. Drag to advance or reject with reason.",
              },
              {
                icon: <ClipboardCheck size={20} />,
                title: "Assessment Rounds",
                desc: "Written tests, coding challenges, and take-home projects. Configure pass thresholds and stage rules to match your process.",
              },
              {
                icon: <CalendarCheck size={20} />,
                title: "Interview Scorecards",
                desc: "Structured feedback is required before stage progression. Panel scores are aggregated automatically.",
              },
              {
                icon: <DollarSign size={20} />,
                title: "Finance Approval Gate",
                desc: "Offers route to Finance for compensation sign-off before reaching the candidate, with a full audit trail.",
              },
              {
                icon: <Users size={20} />,
                title: "Role-Based Access",
                desc: "Recruiter, Interviewer, Hiring Manager, and Finance permissions. One person can hold all roles.",
              },
              {
                icon: <BarChart3 size={20} />,
                title: "Analytics",
                desc: "Pipeline funnel, time-to-hire, and source effectiveness with CSV export.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 80} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-300/20">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ For Companies / Candidates ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 md:items-stretch lg:gap-10">
            <ScrollReveal delay={100} className="h-full">
              <div className="card-lifted-marketing flex h-full min-h-[280px] flex-col p-6 sm:min-h-0 md:min-h-[22rem] md:p-8 lg:p-9">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                  <Building2 size={22} />
                </div>
                <h3 className="heading-card mt-4 text-xl text-white md:text-2xl md:leading-snug">
                  For companies
                </h3>
                <ul className="mt-4 flex-1 space-y-3.5 md:mt-5 md:space-y-4">
                  {[
                    "HM-approved rubrics, FitScore, ideal match, market context when the pool is big enough",
                    "Verdicts + explainable breakdowns (see Talent Intelligence above)",
                    "ATS workflow through offer / finance gates; WhatsApp for candidates, web for your team",
                    "Funnel and source analytics",
                  ].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-3 text-sm leading-relaxed text-white/55 md:text-[0.9375rem]"
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--accent)]">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="cta-bloom mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] sm:w-auto sm:self-start md:mt-auto md:pt-6"
                >
                  Book executive walkthrough <ArrowRight size={14} />
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200} className="h-full">
              <div className="card-lifted-marketing flex h-full min-h-[280px] flex-col p-6 sm:min-h-0 md:min-h-[22rem] md:p-8 lg:p-9">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
                  <Users size={22} />
                </div>
                <h3 className="heading-card mt-4 text-xl text-white md:text-2xl md:leading-snug">
                  For candidates
                </h3>
                <ul className="mt-4 flex-1 space-y-3.5 md:mt-5 md:space-y-4">
                  {[
                    "CV on WhatsApp — scored fast, with a plain-English FitScore per matched role",
                    "One-tap apply; interview slots and updates on WhatsApp",
                    "Track applications and CV versions in one place",
                  ].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-3 text-sm leading-relaxed text-white/55 md:text-[0.9375rem]"
                    >
                      <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08] sm:w-auto sm:self-start md:mt-auto md:pt-6"
                >
                  Open app <ArrowRight size={14} />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ═══ Enterprise Ready ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Governance foundation
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Controls designed for</span>{" "}
              <span className="text-white">accountable hiring operations</span>
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-white/70">
              Integrate identity, access, and approval controls into day-to-day hiring execution
              without adding process drag.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Microsoft OAuth + domain controls",
                desc: "Enforce verified-domain access patterns and reduce identity risk across hiring.",
              },
              {
                title: "2FA policy foundation",
                desc: "Prepare tenant access posture for recruiter and approver workflows as authenticator enrollment rolls out.",
              },
              {
                title: "Compliance actions",
                desc: "Support privacy and audit obligations with reportable retention and DSR operations.",
              },
              {
                title: "Finance approval gate",
                desc: "Require compensation sign-off before offers leave internal governance checks.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 80} className="h-full">
                <div className="card-lifted-marketing h-full p-6">
                  <span className="inline-flex rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Included
                  </span>
                  <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
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
                <span className="heading-display-light text-white/60">See it on</span>{" "}
                <span className="text-white">your own role.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-white/70">
                Send us one JD. We&apos;ll walk you through the rubric, the verdict, and a candidate
                score — live on your data, in under 30 minutes.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center">
                <Link
                  href="/contact"
                  className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Book a walkthrough
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
