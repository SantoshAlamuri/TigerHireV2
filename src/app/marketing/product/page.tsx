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
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";
import { PRODUCT_VS_OTHERS_ROWS } from "@/lib/marketing/product-comparison";

const FitScoreCardMock = dynamic(() => import("@/components/marketing/FitScoreCardMock"), {
  loading: () => <div className="h-80 animate-pulse rounded-2xl bg-white/60" />,
});

export const metadata: Metadata = {
  title: "Product — Talent Intelligence",
  description: `${SITE_MARKETING.brand}: JD Intelligence rubrics, HM-approved FitScore, hiring verdicts, and a full ATS — WhatsApp for candidates, web for your team. ${SITE_MARKETING.tagline}.`,
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
    canonical: "/marketing/product",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} Product | Talent Intelligence`,
    description: SITE_MARKETING.ogDescription,
    url: "https://tigerhire.io/marketing/product",
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
    title: `${SITE_MARKETING.brand} Product | Talent Intelligence`,
    description: SITE_MARKETING.descriptionShort,
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
    url: "https://tigerhire.io/marketing/product",
    description: SITE_MARKETING.description,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <Nav />
      <main className="relative z-10">
        {/* ═══ Hero ═══ */}
        <section className="relative overflow-hidden px-5 pt-24 pb-12 md:pt-32 md:pb-18 lg:px-8">
          <div
            className="mesh-orb mesh-orb-1 left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 bg-amber-500/[0.05]"
            aria-hidden
          />
          <div className="mx-auto max-w-4xl">
            <div className="animate-fade-up animate-fade-up-1">
              <span className="badge-accent">
                <Target size={14} />
                Talent Intelligence
              </span>
            </div>
            <h1 className="heading-hero mt-6 text-[2.5rem] text-[#712B13] sm:text-5xl md:text-6xl animate-fade-up animate-fade-up-2">
              One platform.
              <br />
              <span className="text-[#D44F2E]">From job post to hiring verdict.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#712B13]/80 md:text-xl animate-fade-up animate-fade-up-3">
              <strong className="font-semibold text-[#712B13]">WhatsApp</strong> for chat-first
              candidates; <strong className="font-semibold text-[#712B13]">web apply</strong>,{" "}
              <strong className="font-semibold text-[#712B13]">email-to-job</strong>, and{" "}
              <strong className="font-semibold text-[#712B13]">board apply URLs</strong> feed one
              pipeline. <strong className="font-semibold text-[#712B13]">Web</strong> for your team:
              rubric → FitScore → verdict → full ATS — one stack.
            </p>
          </div>
        </section>

        <JdIntelligenceAgentSection
          variant="marketing"
          footerLink={{
            href: "#how-it-works",
            label: "Next: the five-step flow",
          }}
        />

        {/* ═══ How it Works — with HM Approval Gate ═══ */}
        <section
          id="how-it-works"
          className="mx-auto max-w-6xl scroll-mt-28 px-5 py-14 md:py-20 lg:px-8"
        >
          <ScrollReveal>
            <span className="marketing-section-label">How it works</span>
            <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl">
              Five steps from job post to hired
            </h2>
          </ScrollReveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-5">
            {[
              {
                step: "01",
                title: "Post your job",
                desc: "Add title and JD; run the agent from the job workspace.",
              },
              {
                step: "02",
                title: "Rubric & criteria",
                desc: "Refine must-haves, weighted dimensions, ideal profile, and red flags — backed by the role template library.",
              },
              {
                step: "03",
                title: "HM reviews & approves",
                desc: "Hiring manager signs off. No scoring until then.",
              },
              {
                step: "04",
                title: "Candidates scored",
                desc: "FitScore, ideal match, market context when data exists — fast, queued when the role needs deeper parsing. Verdicts plus per-dimension rationale.",
              },
              {
                step: "05",
                title: "Pipeline to hired",
                desc: "Move candidates through stages, schedule interviews, collect feedback, get approvals — then make the offer.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 80}>
                <div className="card-hover h-full rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-5 backdrop-blur-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-[#D44F2E]/12 border-[#D44F2E]/20 heading-card text-xs text-[#D44F2E]">
                    {item.step}
                  </span>
                  <h3 className="heading-card mt-3 text-sm text-[#712B13]">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[#712B13]/80">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ WhatsApp-First Hiring ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-14 md:py-20 lg:px-8">
          <ScrollReveal>
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              WhatsApp for candidates
            </span>
            <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl">
              Hire where candidates already chat
            </h2>
            <p className="mt-3 max-w-xl text-base text-[#712B13]/80">
              Chat for CV drop, nudges, and replies; pipeline and approvals stay in the web app.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <MessageSquare size={20} />,
                title: "CV Drop",
                desc: "Candidates send their CV on WhatsApp. We parse it, create a profile, and compute FitScore for matched roles as soon as scoring completes.",
              },
              {
                icon: <Target size={20} />,
                title: "Match Delivery",
                desc: "Top job matches can go to the candidate\u2019s WhatsApp. They see role, company, and how they score.",
              },
              {
                icon: <MessageCircle size={20} />,
                title: "One-Tap Apply",
                desc: "Candidate replies 1, 2, or 3 to apply. TigerHire creates the application in chat and asks any required screening questions there.",
              },
              {
                icon: <CalendarCheck size={20} />,
                title: "Schedule & Remind",
                desc: "Interview slots sent via WhatsApp. Candidate picks one by replying. Automated reminders before every interview.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 80}>
                <div className="card-hover h-full rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 backdrop-blur-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-3 text-sm text-[#712B13]">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[#712B13]/80">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={400}>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <UserPlus size={18} />,
                  title: "Employee Referrals",
                  desc: "Employees send \u201cName — Role — City\u201d on WhatsApp. System creates the referral and invites the candidate.",
                },
                {
                  icon: <Users size={18} />,
                  title: "Vouch Collection",
                  desc: "5-question reference check collected entirely over WhatsApp. Structured, timestamped, linked to the candidate.",
                },
                {
                  icon: <ShieldCheck size={18} />,
                  title: "Consent First",
                  desc: "Consent-first. No CV is processed until the candidate explicitly agrees — captured on WhatsApp.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-xl border border-[#D44F2E]/25 bg-white/40 p-5 backdrop-blur-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#712B13]">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#712B13]/80">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ Talent Intelligence — Three-Layer Story ═══ */}
        <section id="talent-intelligence" className="mx-auto max-w-6xl px-5 py-14 md:py-20 lg:px-8">
          <ScrollReveal>
            <span className="marketing-section-label">TigerHire Talent Intelligence</span>
            <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl">
              Other platforms tell you who matches the JD.
              <br />
              <span className="text-[#D44F2E]">TigerHire tells you who to hire.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-base text-[#712B13]/80">
              Those three signals roll into one verdict — with reasons you can share, not just a
              match percentage.
            </p>
          </ScrollReveal>

          {/* Three layers */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ScrollReveal delay={100}>
              <div className="card-hover relative h-full overflow-hidden rounded-2xl border border-[#D44F2E]/25 bg-[#D44F2E]/10 p-6 backdrop-blur-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D44F2E]/12 text-[#D44F2E]">
                  <Target size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[#D44F2E]">
                  Layer 1
                </p>
                <h3 className="heading-card mt-2 text-lg text-[#712B13]">FitScore</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#712B13]/80">
                  How well does this CV match <em>this</em> job? Dimensions and weights come from
                  the rubric your hiring manager approved — not a black-box keyword count.
                </p>
                <p className="mt-3 text-xs font-medium text-[#D44F2E]">0 – 100 role match</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <div className="card-hover relative h-full overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-500/[0.06] p-6 backdrop-blur-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                  <Users size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
                  Layer 2
                </p>
                <h3 className="heading-card mt-2 text-lg text-[#712B13]">Ideal Profile Match</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#712B13]/80">
                  How close are they to your ideal hire? Must-haves, deal-breakers, and the skills
                  that separate good from great — compared on the same bar everyone agreed to.
                </p>
                <p className="mt-3 text-xs font-medium text-purple-400">% match vs. ideal</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="card-hover relative h-full overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6 backdrop-blur-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <TrendingUp size={22} />
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                  Layer 3
                </p>
                <h3 className="heading-card mt-2 text-lg text-[#712B13]">Market position</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#712B13]/80">
                  When enough candidates exist in the same role category, we show how rare this
                  profile is (e.g. Top 5% vs more common). If the pool is still building, we lean on
                  FitScore and ideal match first — then market context catches up.
                </p>
                <p className="mt-3 text-xs font-medium text-emerald-400">
                  Percentile when data exists
                </p>
              </div>
            </ScrollReveal>
          </div>

          {/* Verdict callout */}
          <ScrollReveal delay={400}>
            <div className="mt-8 rounded-2xl border border-[#D44F2E]/20 bg-[#D44F2E]/12/15 p-6 backdrop-blur-sm md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#D44F2E]/12 text-[#D44F2E]">
                  <Eye size={22} />
                </div>
                <div>
                  <h3 className="heading-card text-lg text-[#712B13]">
                    Hiring verdict — one label, three signals
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-[#712B13]/80">
                    Labels include <strong className="text-emerald-400">Strong Hire</strong>,{" "}
                    <strong className="text-blue-400">Safe Hire</strong>,{" "}
                    <strong className="text-amber-400">Hidden Gem</strong>,{" "}
                    <strong className="text-amber-400">Niche Talent</strong>,{" "}
                    <strong className="text-red-400">Pass</strong>. Until pool percentiles are
                    ready: <strong className="text-[#712B13]">Good Fit</strong> /{" "}
                    <strong className="text-[#712B13]">Moderate</strong>. Confidence bands, CV quote
                    evidence, and per-dimension detail are included.
                  </p>
                  <Link
                    href="/contact"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#D44F2E] transition hover:text-[#b83b22]"
                  >
                    Book a demo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Role-specific scoring intelligence */}
          <div className="mt-10">
            <ScrollReveal>
              <h3 className="heading-card text-lg text-[#712B13]">
                Role-specific scoring intelligence
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-[#712B13]/80">
                <strong className="font-semibold text-[#712B13]">121 role templates</strong> ·{" "}
                <strong className="font-semibold text-[#712B13]">20 industries</strong> ·{" "}
                <strong className="font-semibold text-[#712B13]">492 weighted criteria</strong>. The
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
                  <div
                    key={example.role}
                    className="rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-5 backdrop-blur-sm"
                  >
                    <p className="text-sm font-semibold text-[#712B13]">{example.role}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {example.dims.map((d) => (
                        <span
                          key={d}
                          className="rounded-full border border-[#D44F2E]/15 bg-[#D44F2E]/10 px-2.5 py-1 text-xs font-medium text-[#D44F2E]"
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
        <section
          id="comparison"
          className="mx-auto max-w-5xl scroll-mt-28 px-5 py-14 md:py-20 lg:px-8"
        >
          <ScrollReveal>
            <div className="text-center">
              <span className="marketing-section-label">TigerHire vs other tools</span>
              <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl lg:text-[2.25rem]">
                What others miss, we solve
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="mt-8 overflow-hidden rounded-2xl border border-[#D44F2E]/25 bg-white/40 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm md:min-w-[680px]">
                  <thead>
                    <tr className="border-b border-[#D44F2E]/25">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#712B13]/60">
                        Capability
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#712B13]/60">
                        Other AI hiring tools
                      </th>
                      <th className="border-l border-[#D44F2E]/20 bg-[#D44F2E]/12/20 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#D44F2E]">
                        TigerHire
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D44F2E]/25">
                    {PRODUCT_VS_OTHERS_ROWS.map((row) => (
                      <tr key={row.feature}>
                        <td className="px-6 py-3.5 text-sm font-medium text-[#712B13]">
                          {row.feature}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#712B13]/80">{row.other}</td>
                        <td className="border-l border-[#D44F2E]/20 bg-[#D44F2E]/10 px-5 py-3.5 text-sm font-medium text-[#D44F2E]">
                          {row.th}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ═══ Built-in ATS ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-14 md:py-20 lg:px-8">
          <ScrollReveal>
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Applicant tracking system
            </span>
            <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl">
              A hiring workflow ATS. Not an afterthought.
            </h2>
            <p className="mt-3 max-w-xl text-base text-[#712B13]/80">
              Scoring is the start, not the finish. TigerHire carries teams from approved criteria
              to signed offer — pipeline, interviews, feedback, and governance in one workflow.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <ScrollReveal key={item.title} delay={i * 80}>
                <div className="card-hover h-full rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-5 backdrop-blur-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                    {item.icon}
                  </div>
                  <h3 className="heading-card mt-4 text-base text-[#712B13]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#712B13]/80">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ For Companies / Candidates ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-14 md:py-20 lg:px-8">
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 md:items-stretch lg:gap-10">
            <ScrollReveal delay={100} className="h-full">
              <div className="flex h-full min-h-[280px] flex-col rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-6 backdrop-blur-sm sm:min-h-0 md:min-h-[22rem] md:p-8 lg:p-9">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D44F2E]/12 text-[#D44F2E]">
                  <Building2 size={22} />
                </div>
                <h3 className="heading-card mt-4 text-xl text-[#712B13] md:text-2xl md:leading-snug">
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
                      className="flex items-start gap-3 text-sm leading-relaxed text-[#712B13]/80 md:text-[0.9375rem]"
                    >
                      <span className="mt-0.5 shrink-0 text-[#D44F2E]">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="hover-lift mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#D44F2E] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[#b83b22] sm:w-auto sm:self-start md:mt-auto md:pt-6"
                >
                  Book a demo <ArrowRight size={14} />
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200} className="h-full">
              <div className="flex h-full min-h-[280px] flex-col rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-6 backdrop-blur-sm sm:min-h-0 md:min-h-[22rem] md:p-8 lg:p-9">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Users size={22} />
                </div>
                <h3 className="heading-card mt-4 text-xl text-[#712B13] md:text-2xl md:leading-snug">
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
                      className="flex items-start gap-3 text-sm leading-relaxed text-[#712B13]/80 md:text-[0.9375rem]"
                    >
                      <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="hover-lift mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#D44F2E]/25 bg-white px-6 py-3.5 text-sm font-semibold text-[#712B13] transition hover:border-[#D44F2E]/40 sm:w-auto sm:self-start md:mt-auto md:pt-6"
                >
                  Open app <ArrowRight size={14} />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ═══ Enterprise Ready ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-14 md:py-20 lg:px-8">
          <ScrollReveal>
            <span className="marketing-section-label">Enterprise-ready</span>
            <h2 className="heading-section mt-3 text-2xl text-[#712B13] md:text-3xl">
              Enterprise-ready out of the box
            </h2>
            <p className="mt-3 max-w-3xl text-base text-[#712B13]/80">
              TigerHire fits into how enterprise teams already work, with identity, provisioning,
              and approval controls built in.
            </p>
          </ScrollReveal>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Azure AD SSO",
                desc: "Login via Entra ID. No separate password. Auto-provisioned on first login.",
              },
              {
                title: "SCIM-ready provisioning",
                desc: "SCIM users and groups sync into TigerHire with role mapping from approved membership data.",
              },
              {
                title: "Bulk CSV upload",
                desc: "Import employees with role assignments for teams not yet on Azure AD.",
              },
              {
                title: "Finance approval gate",
                desc: "Compensation sign-off before any offer reaches a candidate.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 80}>
                <div className="card-hover h-full rounded-2xl border border-[#D44F2E]/25 bg-white/40 p-5 backdrop-blur-sm">
                  <h3 className="heading-card text-sm text-[#712B13]">{item.title}</h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[#712B13]/80">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="relative overflow-hidden">
          <div
            className="mesh-orb mesh-orb-2 left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 bg-amber-500/[0.06]"
            aria-hidden
          />
          <ScrollReveal>
            <div className="relative mx-auto max-w-3xl px-5 py-16 text-center md:py-24 lg:px-8">
              <h2 className="heading-page text-3xl text-[#712B13] md:text-4xl">See it in action</h2>
              <p className="mx-auto mt-4 max-w-lg text-lg text-[#712B13]/80">
                Book 20 minutes — bring a role and walk the stack end to end.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <a
                  href="mailto:hello@tigerhire.io"
                  className="hover-lift group flex items-center gap-2 rounded-full bg-[#D44F2E] px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-[#b83b22]"
                >
                  Reach out — hello@tigerhire.io
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
      <Footer />
    </>
  );
}
