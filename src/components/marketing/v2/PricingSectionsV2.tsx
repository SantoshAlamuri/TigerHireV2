import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { buttonClasses } from "@/components/ui/Button";
import styles from "@/app/(public)/v2/v2.module.css";

const eyebrow = `${styles.mono} text-xs uppercase tracking-[0.14em] text-[var(--accent)]`;
const h2 = "mt-3.5 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl";

const PLANS = [
  {
    name: "Growth",
    price: "₹4,999",
    unit: " /month",
    detail: "Up to 3 active roles. Cancel anytime — the wager decides if you stay.",
    features: [
      "JD Intelligence + approved rubrics",
      "Explainable FitScore on every CV",
      "Full ATS — pipeline to offers",
      "WhatsApp apply + referral links",
    ],
    cta: "Start with the wager",
    popular: false,
  },
  {
    name: "Business",
    price: "₹14,999",
    unit: " /month",
    detail: "Up to 15 active roles, with a shared view across all of them.",
    features: [
      "Everything in Growth",
      "Finance approval gate on offers",
      "Role-based access + domain controls",
      "Funnel, time-to-hire & source analytics",
      "Dedicated success contact",
    ],
    cta: "Start with the wager",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: " annual",
    detail: "Security, identity and rollout at scale, with SLA terms.",
    features: [
      "Everything in Business",
      "SSO + SCIM-ready provisioning",
      "2FA policy foundation",
      "Retention, DSR & audit tooling",
      "Rubric libraries per business unit",
      "Implementation & change support",
    ],
    cta: "Request a brief",
    popular: false,
  },
];

export function PricingSectionV2() {
  return (
    <section id="pricing" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={eyebrow}>Pricing</p>
        <h2 className={h2}>
          Priced like a tool.
          <br />
          Not like an agency fee.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-[var(--text-muted)]">
          One agency placement costs ₹80,000+. TigerHire reads every CV on every role, all month,
          for less than a tenth of that. Every plan includes the full scoring engine and the hiring
          workflow ATS — no feature gates on hiring quality.
        </p>
        <ScrollReveal className="mt-11 grid gap-5 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-[var(--bg-elevated)] p-8 ${
                plan.popular ? "border-amber-500/45" : "border-[var(--border)]"
              }`}
            >
              {plan.popular && (
                <span
                  className={`${styles.mono} absolute -top-2.5 left-6 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-black`}
                >
                  Most teams
                </span>
              )}
              <h3 className="text-[17px] font-bold">{plan.name}</h3>
              <div className={`${styles.mono} mb-0.5 mt-3.5 text-3xl font-semibold`}>
                {plan.price}
                <span className="text-[13px] font-normal text-[var(--text-subtle)]">
                  {plan.unit}
                </span>
              </div>
              <p className="mb-4 text-[13.5px] text-[var(--text-subtle)]">{plan.detail}</p>
              <ul className="mb-6 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span className="text-[var(--accent)]">— </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className={buttonClasses(
                  plan.popular ? "primary" : "secondary",
                  "md",
                  "mt-auto justify-center",
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </ScrollReveal>
        <p className={`${styles.mono} mt-5 text-xs text-[var(--text-subtle)]`}>
          Introductory pricing for early teams — final tiers may change.
        </p>
      </div>
    </section>
  );
}

export function CandidatesStripV2() {
  return (
    <section id="candidates" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
        <div>
          <p className={eyebrow}>For candidates</p>
          <h3 className="mb-1.5 mt-2.5 text-xl font-bold">
            Your CV actually gets read. All of it.
          </h3>
          <p className="max-w-2xl text-[15px] text-[var(--text-muted)]">
            Apply on WhatsApp — no forms, no logins. See your FitScore for each role with
            plain-English reasons, and track every application. Free for candidates, always.
          </p>
        </div>
        <Link href="/jobs" className={buttonClasses("secondary", "md", "gap-2")}>
          Browse open roles <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
