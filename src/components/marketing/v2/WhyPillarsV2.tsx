import { Activity, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { IconTile } from "@/components/ui/IconTile";
import styles from "@/app/(public)/v2/v2.module.css";

/** Repurposed from the current homepage's "Why teams choose TigerHire" section — same pillars, same copy. */
const PILLARS = [
  {
    icon: <Sparkles size={18} />,
    title: "One bar, approved up front",
    description:
      "Hiring managers sign off on weighted criteria before anyone is screened — the debate happens once, up front.",
  },
  {
    icon: <CheckCircle2 size={18} />,
    title: "Every score, explained",
    description:
      "Plain-English rationale on every candidate. No black boxes, no keyword games — and if a criterion isn't on the approved rubric, it isn't scored.",
  },
  {
    icon: <Activity size={18} />,
    title: "End-to-end in one place",
    description:
      "WhatsApp for candidates, ATS for your team, finance sign-off on offers. No juggling five tools.",
  },
  {
    icon: <ShieldCheck size={18} />,
    title: "Built for audit, not theatre",
    description:
      "SSO, role-based access, retention controls and data-subject-request tooling — the governance your legal and security teams already ask for.",
  },
];

export default function WhyPillarsV2() {
  return (
    <section id="why" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={`${styles.mono} text-xs uppercase tracking-[0.14em] text-[var(--accent)]`}>
          Why teams choose TigerHire
        </p>
        <ScrollReveal>
          <h2 className="mt-3.5 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
            <span className="text-white/60">The discipline of a board review.</span>
            <br className="hidden sm:block" />
            <span className="text-white">The pace of a startup.</span>
          </h2>
        </ScrollReveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((item, index) => (
            <ScrollReveal key={item.title} delay={index * 80} className="h-full">
              <div className="card-lifted-marketing h-full p-6">
                <IconTile size="md">{item.icon}</IconTile>
                <h3 className="heading-card mt-3 text-sm text-white">{item.title}</h3>
                <p className="mt-1.5 text-body-sm leading-relaxed text-[var(--text-subtle)]">
                  {item.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
