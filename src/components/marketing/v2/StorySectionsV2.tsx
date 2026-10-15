import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { buttonClasses } from "@/components/ui/Button";
import DemoV2 from "./DemoV2";
import styles from "@/app/(public)/v2/v2.module.css";

const eyebrow = `${styles.mono} text-xs uppercase tracking-[0.14em] text-[var(--accent)]`;
const h2 = "mt-3.5 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl";
const sub = "mt-4 max-w-2xl text-lg text-[var(--text-muted)]";

/** Repurposed from the current homepage — its sharpest framing, kept verbatim. */
export function ProblemSectionV2() {
  return (
    <section id="problem" className="border-t border-[var(--border)] px-6 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className={eyebrow}>The problem</p>
        <h2 className={`${h2} mx-auto`}>
          The problem isn&apos;t finding candidates.
          <br />
          It&apos;s deciding between them.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--text-muted)]">
          Keyword matching doesn&apos;t tell you who to interview. You need a{" "}
          <strong className="font-semibold text-[var(--text)]">
            decision your team can stand behind
          </strong>{" "}
          — fast.
        </p>
      </div>
    </section>
  );
}

export function DemoSectionV2() {
  return (
    <section id="live-demo" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={eyebrow}>Live demo · your JD, your candidates</p>
        <h2 className={h2}>
          Don&apos;t take our word for it.
          <br />
          Watch the agent show its work.
        </h2>
        <p className={sub}>
          This is the actual product flow: paste any JD, the agent drafts the rubric, and every CV
          is scored against it. Upload up to 10 of your own CVs, or use our sample pool of 10
          fictional profiles.{" "}
          <strong className="font-semibold text-[var(--text)]">
            The scoring is live — this demo runs on the same engine our customers use.
          </strong>{" "}
          Nothing you upload is stored.
        </p>
        <DemoV2 />
      </div>
    </section>
  );
}

const PROOF_STATS = [
  {
    big: "380",
    unit: " CVs",
    cap: "One batch, one day — nothing skimmed, everything read. Done before the next stand-up.",
  },
  {
    big: "7",
    unit: " of 11",
    cap: 'of our top-ranked candidates were rated "good to interview" in a blind review by the hiring team — first role, zero tuning, no human pre-filter.',
  },
  {
    big: "<24",
    unit: "h",
    cap: "From raw CV pile to interview-ready shortlist. Most teams take weeks to get here.",
  },
];

export function ProofSectionV2() {
  return (
    <section id="proof" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={eyebrow}>From a live pilot · July 2026</p>
        <h2 className={h2}>
          380 CVs landed on one recruiter.
          <br />
          Every single one was read by lunch.
        </h2>
        <ScrollReveal className="mt-11 grid gap-5 md:grid-cols-3">
          {PROOF_STATS.map((stat) => (
            <div
              key={stat.unit}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8"
            >
              <div className={styles.proofBig}>
                {stat.big}
                <span className={styles.proofUnit}>{stat.unit}</span>
              </div>
              <p className="mt-3 text-[15px] text-[var(--text-muted)]">{stat.cap}</p>
            </div>
          ))}
        </ScrollReveal>
        <p className={`${styles.mono} mt-6 text-xs text-[var(--text-subtle)]`}>
          Numbers from a production pilot with an edtech hiring team, July 2026.
        </p>
      </div>
    </section>
  );
}

const WAGER_STEPS = [
  {
    num: "STEP 01",
    title: "Give us one live role",
    body: "A real opening with real applicants. Your hiring manager approves the rubric — takes ten minutes.",
  },
  {
    num: "STEP 02",
    title: "Blind review",
    body: "The agent scores the full pile. Your manager reviews our top 10 blind — no scores shown — and rates each candidate the way they always would.",
  },
  {
    num: "STEP 03",
    title: "The match rate decides",
    body: "Those blind ratings are the verdict. If they wouldn't interview at least 6 of our top 10, walk away — keep the scorecards, pay nothing, no exit meeting required.",
  },
];

export function WagerSectionV2() {
  return (
    <section
      id="wager"
      className="border-t border-[var(--border)] bg-gradient-to-b from-amber-500/5 to-transparent px-6 py-24"
    >
      <div className="mx-auto max-w-6xl">
        <p className={eyebrow}>The TigerHire Wager</p>
        <h2 className={h2}>
          If our shortlist doesn&apos;t match
          <br />
          your hiring manager&apos;s picks, you pay nothing.
        </h2>
        <p className={sub}>
          We don&apos;t ask you to trust an agent you&apos;ve never met. One test: after reading all
          500, does the agent land on the same people your hiring manager would pick?{" "}
          <strong className="font-semibold text-[var(--text)]">
            The threshold is agreed in writing
          </strong>{" "}
          before the pilot starts.
        </p>
        <ScrollReveal>
          <div className={styles.wagerCard}>
            <div className="grid gap-7 md:grid-cols-3">
              {WAGER_STEPS.map((step) => (
                <div key={step.num}>
                  <p className={`${styles.mono} text-xs tracking-[0.12em] text-[var(--accent)]`}>
                    {step.num}
                  </p>
                  <h3 className="mb-2 mt-2 text-lg font-bold">{step.title}</h3>
                  <p className="text-[14.5px] text-[var(--text-muted)]">{step.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-[var(--border)] pt-6">
              <p className="max-w-xl text-[13.5px] text-[var(--text-subtle)]">
                No credit card. No contract until after the verdict. Flat monthly plans priced by
                active roles — the exact number shared before the wager, not after. The pilot runs
                on your data, under your access controls, and everything is exportable if you walk
                away.
              </p>
              <Link href="/contact" className={buttonClasses("primary", "md", "gap-2")}>
                Start the wager <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

const HOW_STEPS = [
  {
    num: "01",
    title: "Post the role",
    body: "Paste the JD. The agent drafts a weighted rubric for manager review.",
  },
  {
    num: "02",
    title: "Manager approves the bar",
    body: "The rubric is locked before screening starts — so shortlists don't get re-litigated later.",
  },
  {
    num: "03",
    title: "Every CV scored",
    body: "All applicants — Naukri, LinkedIn, WhatsApp, email — scored against the same bar, with evidence and flags.",
  },
  {
    num: "04",
    title: "Decide with evidence",
    body: "Shortlist to offer in one place: interviews, scorecards, offer approvals with finance sign-off, full audit trail.",
  },
];

export function HowSectionV2() {
  return (
    <section id="how" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={eyebrow}>How it works</p>
        <h2 className={h2}>From job post to defensible shortlist</h2>
        <p className={sub}>
          Use TigerHire as your hiring workflow ATS, or start with screening alongside the stack you
          already run — the wager works either way.
        </p>
        <ScrollReveal className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((step) => (
            <div
              key={step.num}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6"
            >
              <p className={`${styles.mono} text-xs text-[var(--accent)]`}>{step.num}</p>
              <h3 className="mb-2 mt-2.5 text-[16.5px] font-bold">{step.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{step.body}</p>
            </div>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
