"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import styles from "@/app/(public)/v2/v2.module.css";

const PILE_ROWS = [
  { name: "cv-101", score: 82 },
  { name: "cv-102", score: 74 },
  { name: "cv-103", score: 68 },
  { name: "cv-104", score: 61 },
  { name: "cv-105", score: 77 },
  { name: "cv-106", score: 58 },
  { name: "cv-107", score: 71 },
  { name: "cv-108", score: 64 },
];
const PILE_TOTAL = 500;

function bandClass(score: number): string {
  if (score >= 75) return styles.bandStrong;
  if (score >= 60) return styles.bandMid;
  return styles.bandLow;
}

export default function HeroV2() {
  const [readCount, setReadCount] = useState(0);
  const [displayTotal, setDisplayTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setReadCount(PILE_ROWS.length);
      setDisplayTotal(PILE_TOTAL);
      return;
    }
    let step = 0;
    const tick = () => {
      step += 1;
      setReadCount(step);
      setDisplayTotal(Math.min(PILE_TOTAL, Math.round((step / PILE_ROWS.length) * PILE_TOTAL)));
      if (step < PILE_ROWS.length) timerRef.current = setTimeout(tick, 420);
    };
    timerRef.current = setTimeout(tick, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <header className="relative overflow-hidden px-6 pb-20 pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-16 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h1 className="mb-6 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            You got 500 applications.
            <br />
            <span className="text-[var(--text-subtle)]">By the time your team reads 30,</span>
            <br />
            <span className="text-[var(--accent)]">we&apos;ve read all 500.</span>
          </h1>
          <p className="mb-9 max-w-2xl text-lg text-[var(--text-muted)] md:text-xl">
            TigerHire scores every applicant against a bar your hiring manager approves — and{" "}
            <strong className="font-semibold text-[var(--text)]">
              shows its work on every single one
            </strong>
            . Evidence, gaps, and a{" "}
            <strong className="font-semibold text-[var(--text)]">plain-English verdict</strong> you
            can defend to the interview panel.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/contact" className={buttonClasses("primary", "lg", "gap-2.5")}>
              Prove it on one role — free
              <ArrowRight size={16} />
            </Link>
            <Link href="/demo" className={buttonClasses("secondary", "lg")}>
              Watch it score a CV
            </Link>
          </div>
          <div className={styles.guaranteeLine}>
            <span aria-hidden>◆</span>
            <span>
              If our shortlist doesn&apos;t match your hiring manager&apos;s picks,{" "}
              <strong className="font-semibold text-[var(--accent)]">you pay nothing.</strong>
            </span>
          </div>
        </div>

        <div aria-label="Illustration: every CV gets read and scored">
          <div className={styles.pileHead}>
            <span className={styles.pileCount}>{displayTotal}</span>
            <span
              className={`${styles.mono} text-[11.5px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
            >
              CVs read &amp; scored
            </span>
          </div>
          {PILE_ROWS.map((row, i) => {
            const read = i < readCount;
            return (
              <div key={row.name} className={`${styles.cvrow} ${read ? bandClass(row.score) : ""}`}>
                <span className={styles.cvrowDot} />
                <span>{row.name}</span>
                <span className={styles.cvrowBar} />
                <span className={styles.cvrowScore}>{read ? row.score : ""}</span>
              </div>
            );
          })}
          <p className={`${styles.mono} mt-3 text-xs text-[var(--text-subtle)]`}>
            every applicant · same approved bar ·{" "}
            <span className="text-[color:#34d399]">zero unread</span>
          </p>
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        {PERSONAS.map((persona) => (
          <Link
            key={persona.href}
            href={persona.href}
            className="card-lifted-marketing card-lifted-marketing-hover group block p-6 text-left"
          >
            <p className="text-base font-extrabold text-white">{persona.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-subtle)]">{persona.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[var(--text-subtle)] transition group-hover:text-white">
              Learn more <ArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
    </header>
  );
}

/** Repurposed from the current homepage — same audiences, same destinations. */
const PERSONAS = [
  {
    href: "/companies",
    title: "For talent leaders",
    body: "Standardise the hiring bar across your organisation.",
  },
  {
    href: "/agencies",
    title: "For agencies",
    body: "Back every shortlist with shared evidence.",
  },
  {
    href: "/candidates",
    title: "For candidates",
    body: "Apply on WhatsApp and see how you fit each role.",
  },
];
