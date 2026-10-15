import Link from "next/link";
import { ArrowRight, ListChecks, Sparkles, Target, AlertTriangle } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";

type Variant = "marketing" | "public";

const STYLES = {
  marketing: {
    section: "px-5 py-24 lg:px-8",
    inner: "mx-auto max-w-6xl",
    eyebrow:
      "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40",
    title: "heading-display mt-4 text-3xl md:text-4xl lg:text-5xl text-white",
    titleAccent: "heading-display-light text-white/60",
    lead: "mt-6 max-w-2xl text-lg leading-relaxed text-white/70",
    card: "card-lifted-marketing p-6 md:p-8",
    cardIcon:
      "flex h-11 w-11 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]",
    itemTitle: "text-sm font-semibold text-white",
    itemDesc: "mt-1 text-sm leading-relaxed text-white/55",
    link: "mt-8 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]",
    note: "mt-6 text-sm text-white/55",
  },
  public: {
    section: "px-5 py-24 lg:px-8",
    inner: "mx-auto max-w-6xl",
    eyebrow:
      "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40",
    title: "heading-display mt-4 text-3xl md:text-4xl lg:text-5xl text-white",
    titleAccent: "heading-display-light text-white/60",
    lead: "mt-6 max-w-2xl text-lg leading-relaxed text-white/70",
    card: "card-lifted-marketing p-6 md:p-8",
    cardIcon:
      "flex h-11 w-11 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]",
    itemTitle: "text-sm font-semibold text-white",
    itemDesc: "mt-1 text-sm leading-relaxed text-white/55",
    link: "mt-8 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]",
    note: "mt-6 text-sm text-white/55",
  },
} as const;

const ITEMS = [
  {
    icon: Target,
    title: "Must-haves & nice-to-haves",
    body: "Weighted skills extracted from your title and description — specific to the role, not a generic template.",
  },
  {
    icon: ListChecks,
    title: "Scoring dimensions (100%)",
    body: "Dimensions such as technical fit, experience relevance, and communication — with weights that sum to 100 so FitScore stays comparable.",
  },
  {
    icon: Sparkles,
    title: "Ideal candidate profile",
    body: "A short narrative summary hiring managers can edit before anyone is scored, so the bar is explicit.",
  },
  {
    icon: AlertTriangle,
    title: "Red-flag indicators",
    body: "Role-specific warning signals to surface during screening, aligned to how you actually hire.",
  },
] as const;

const COMPACT_LEAD =
  "Paste a title and JD; the agent drafts a weighted rubric your hiring manager approves before anyone is scored.";

export default function JdIntelligenceAgentSection({
  variant,
  footerLink,
  density = "default",
}: {
  variant: Variant;
  /** Omit for default product tour link; pass `null` to hide; pass custom for in-page anchors. */
  footerLink?: { href: string; label: string } | null;
  /** `compact` = short intro + link only (for home pages; full rubric detail lives on /product). */
  density?: "default" | "compact";
}) {
  const s = STYLES[variant];
  const defaultTour =
    variant === "marketing"
      ? "/marketing/product#jd-intelligence-agent"
      : "/product#jd-intelligence-agent";
  const link =
    footerLink === undefined
      ? {
          href: defaultTour,
          label:
            density === "compact" ? "How the rubric is built" : "See it in the platform overview",
        }
      : footerLink;

  return (
    <section id="jd-intelligence-agent" className={s.section} aria-labelledby="jd-agent-heading">
      <div className={s.inner}>
        <ScrollReveal>
          <p className={s.eyebrow}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            Role rubrics
          </p>
          <h2 id="jd-agent-heading" className={s.title}>
            <span className={s.titleAccent}>The JD Intelligence agent</span>
            <br className="hidden sm:block" />
            <span className="text-white">from paste to rubric</span>
          </h2>
          {density === "compact" ? (
            <p className={s.lead}>{COMPACT_LEAD}</p>
          ) : (
            <p className={s.lead}>
              Drop in a job title and description. Our agent builds a structured skills rubric on
              the job: what matters, how much it weighs, who &ldquo;good&rdquo; looks like, and what
              should worry you. That rubric powers FitScore and downstream screening so every
              candidate is read against the same bar — after your hiring manager approves it.
            </p>
          )}
        </ScrollReveal>

        {density === "default" ? (
          <div className="alive-halo-lg mt-12 grid gap-4 sm:grid-cols-2">
            {ITEMS.map((item, i) => (
              <ScrollReveal key={item.title} delay={80 + i * 60}>
                <div className={s.card}>
                  <div className={s.cardIcon}>
                    <item.icon size={22} strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className={`${s.itemTitle} mt-4`}>{item.title}</h3>
                  <p className={s.itemDesc}>{item.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        ) : null}

        <ScrollReveal delay={density === "compact" ? 80 : 120}>
          {density === "default" ? (
            <p className={s.note}>
              Run from the job workspace; output is saved on the role and powers FitScore and
              screening after the hiring manager signs off.
            </p>
          ) : null}
          {link && (
            <Link href={link.href} className={`${s.link} ${density === "compact" ? "mt-6" : ""}`}>
              {link.label}
              <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}
