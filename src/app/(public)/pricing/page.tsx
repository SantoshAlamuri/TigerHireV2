"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Activity,
  Building2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";

type Plan = {
  key: "growth" | "business" | "enterprise";
  name: string;
  tagline: string;
  priceLabel: string;
  priceNote: string;
  fit: string;
  icon: React.ReactNode;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

const PLANS: Plan[] = [
  {
    key: "growth",
    name: "Growth",
    tagline: "For teams making their first hires with structure.",
    priceLabel: "₹4,999",
    priceNote: "Up to 3 active roles. Cancel anytime — the wager decides if you stay.",
    fit: "Teams hiring across a handful of roles who need the full engine without heavy rollout.",
    icon: <Sparkles size={18} />,
    features: [
      "Rubrics drafted by the agent, approved by your hiring manager",
      "Explainable FitScore on every CV",
      "Full ATS — pipeline, scorecards, offers",
      "WhatsApp apply, referral links, candidate portal",
      "Email-led onboarding (self-serve)",
    ],
    cta: { label: "Start with the wager", href: "/contact" },
  },
  {
    key: "business",
    name: "Business",
    tagline: "Multi-role hiring with tighter governance.",
    priceLabel: "₹14,999",
    priceNote: "Up to 15 active roles, with a shared view across all of them.",
    fit: "Talent teams running many roles at once who want one operating view.",
    icon: <Activity size={18} />,
    features: [
      "Everything in Growth, plus",
      "Ideal profile + market position when pool is ready",
      "Offer approvals with finance sign-off",
      "Role-based access + domain controls",
      "Analytics: funnel, time-to-hire, source quality",
      "Dedicated success contact",
    ],
    cta: { label: "Start with the wager", href: "/contact" },
    highlighted: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Governance, identity, and rollout at scale.",
    priceLabel: "Custom",
    priceNote: "Annual contract with rollout & SLA terms.",
    fit: "Orgs with security, privacy, or multi-BU complexity who need a tailored rollout.",
    icon: <Building2 size={18} />,
    features: [
      "Everything in Business, plus",
      "Microsoft OAuth + 2FA policy foundation",
      "Retention, DSR, and audit tooling",
      "SSO + SCIM-ready provisioning",
      "Custom rubric libraries per business unit",
      "Implementation + change management support",
    ],
    cta: { label: "Request brief", href: "mailto:hello@tigerhire.io" },
  },
];

const EVERY_PLAN_INCLUDES = [
  "JD Intelligence agent extending 121 role templates",
  "HM approval gate before scoring starts",
  "Explainable FitScore on every candidate",
  "Hiring workflow ATS included — no add-on modules",
  "WhatsApp-first candidate journeys",
  "Referral programme with per-role tracking",
  "Export-ready evidence for every decision",
  "Privacy-first data handling",
];

export default function PricingPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="alive-air-hero relative z-10">
        {/* Hero */}
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
              Pricing
            </span>
            <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl animate-fade-up animate-fade-up-2">
              <span className="heading-display-light text-white/55">Priced like a tool.</span>{" "}
              <span className="text-white">Not like an agency fee.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/65 md:text-2xl animate-fade-up animate-fade-up-3">
              One agency placement costs ₹80,000+. TigerHire reads every CV on every role, all
              month, for less than a tenth of that. Flat monthly plans by active roles — the full
              engine and hiring workflow ATS in every tier, no feature gates.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-white/50 animate-fade-up animate-fade-up-3">
              Start with the wager: one live role, and if our shortlist doesn&apos;t match your
              hiring manager&apos;s picks, you pay nothing.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center animate-fade-up animate-fade-up-4">
              <Link
                href="/contact"
                className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Start the wager
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PLANS.map((plan, i) => (
              <ScrollReveal key={plan.key} delay={i * 90} className="h-full">
                <div
                  className={`card-lifted-marketing relative flex h-full flex-col p-8 ${
                    plan.highlighted
                      ? "border-l-4 border-l-[var(--accent)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--accent)]"
                      : ""
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-2 left-8 rounded-md bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-black">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                      {plan.icon}
                    </div>
                    <span className="text-sm uppercase tracking-[0.18em] text-white/45">
                      {plan.key === "enterprise" ? "Annual" : "Flat monthly"}
                    </span>
                  </div>
                  <h3 className="heading-card mt-4 text-xl text-white">{plan.name}</h3>
                  <p className="mt-1.5 text-sm text-white/55">{plan.tagline}</p>
                  <p className="mt-2 text-xs text-white/45">{plan.priceNote}</p>

                  <div className="mt-5">
                    <p className="heading-display text-5xl text-white md:text-6xl tabular-nums">
                      {plan.priceLabel}
                    </p>
                    <p className="text-base text-white/55">
                      {plan.key === "enterprise" ? "annual" : "/month"}
                    </p>
                  </div>

                  <p className="mt-5 text-[0.82rem] leading-relaxed text-white/55">{plan.fit}</p>

                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-2 text-sm leading-relaxed text-white/65"
                      >
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-emerald-300/80"
                          aria-hidden
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.cta.href}
                    className={`mt-7 inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition ${
                      plan.highlighted
                        ? "bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]"
                        : "border border-white/15 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/[0.08]"
                    }`}
                  >
                    {plan.cta.label}
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-white/45">
            Not sure which tier?{" "}
            <Link href="/contact" className="font-semibold text-white/75 hover:text-white">
              Share your hiring plan
            </Link>{" "}
            and we&apos;ll recommend one.
          </p>
        </section>

        {/* In every plan */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <div className="text-center">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                In every plan
              </span>
              <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
                <span className="heading-display-light text-white/60">No feature gates on</span>{" "}
                <span className="text-white">the decision engine</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
                We don&apos;t lock core hiring quality behind higher tiers. Everyone gets the
                rubric, the verdict, and the evidence trail.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={120}>
            <div className="card-lifted-marketing mt-8 grid gap-x-6 gap-y-2 p-6 md:grid-cols-2 md:p-8">
              {EVERY_PLAN_INCLUDES.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2.5 py-1.5 text-[0.9rem] text-white/65"
                >
                  <CheckCircle2
                    size={15}
                    className="mt-0.5 shrink-0 text-emerald-300/80"
                    aria-hidden
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* Trust row */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <ScrollReveal>
            <h2 className="heading-display text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Operating trust built</span>{" "}
              <span className="text-white">into every tier</span>
            </h2>
          </ScrollReveal>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: <ShieldCheck size={18} />,
                title: "Audit-ready, out of the box",
                desc: "Verdicts, approvals, and stage changes are logged. Retention and DSR tools ship with the product.",
              },
              {
                icon: <Activity size={18} />,
                title: "One operating view",
                desc: "Funnel, source quality, and time-to-hire across every role — no spreadsheet glue.",
              },
              {
                icon: <MessageCircle size={18} />,
                title: "Human support, not just docs",
                desc: "Every plan includes real humans. Enterprise adds named success + implementation.",
              },
            ].map((item) => (
              <div key={item.title} className="card-lifted-marketing p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/65 ring-1 ring-inset ring-white/[0.06]">
                  {item.icon}
                </div>
                <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden py-32">
          <div
            className="mesh-orb mesh-orb-2 left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 bg-amber-500/[0.06]"
            aria-hidden
          />
          <ScrollReveal>
            <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
              <h2 className="heading-display text-4xl md:text-6xl">
                <span className="heading-display-light text-white/60">
                  Tell us your hiring plan.
                </span>{" "}
                <span className="text-white">We&apos;ll match the tier.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-white/70">
                Share your role count, team size, and governance needs. We&apos;ll reply with a plan
                recommendation, onboarding path, and quote.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center">
                <Link
                  href="/contact"
                  className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Get a quote
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
