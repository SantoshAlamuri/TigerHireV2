"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STEP_LABELS, STEP_ORDER } from "./_lib/constants";
import { useOnboarding } from "./_hooks/use-onboarding";
import { ResumeStep } from "./_components/steps/ResumeStep";
import { BasicsStep } from "./_components/steps/BasicsStep";
import { SkillsStep } from "./_components/steps/SkillsStep";
import { PreferencesStep } from "./_components/steps/PreferencesStep";
import { VerifyStep } from "./_components/steps/VerifyStep";
import { DoneStep } from "./_components/steps/DoneStep";

export default function CandidateOnboardingPage() {
  const s = useOnboarding();
  const { step, setStep, stepIndex, goNext, goBack, saving, completeness, firstName } = s;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-2">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="heading-page text-2xl text-[var(--text)]">Set up your profile</h1>
            <p className="text-body mt-1 text-sm text-[var(--text-muted)]">
              Hi {firstName} — a few quick steps and you can apply and refer from one place.
            </p>
          </div>
          <Link
            href="/candidate"
            onClick={s.dismissOnboarding}
            className="focus-ring rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            Skip for now
          </Link>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-caption font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            <span>Profile strength</span>
            <span className="tabular-nums text-[var(--text-muted)]">{completeness.pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${completeness.pct}%` }}
            />
          </div>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Setup steps">
          {STEP_ORDER.map((key, idx) => {
            const active = key === step;
            const done = idx < stepIndex;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStep(key)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-ring ${
                  active
                    ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] bg-white/[0.02] text-[var(--text-subtle)] hover:text-[var(--text)]"
                }`}
              >
                {done ? <Check size={13} aria-hidden /> : null}
                {STEP_LABELS[key]}
              </button>
            );
          })}
        </nav>
      </header>

      <section className="card-lifted p-6">
        {step === "resume" ? <ResumeStep s={s} /> : null}
        {step === "basics" ? <BasicsStep s={s} /> : null}
        {step === "skills" ? <SkillsStep s={s} /> : null}
        {step === "preferences" ? <PreferencesStep s={s} /> : null}
        {step === "verify" ? <VerifyStep s={s} /> : null}
        {step === "done" ? <DoneStep s={s} /> : null}
      </section>

      {step !== "done" ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={goBack} disabled={stepIndex === 0}>
            <ArrowLeft size={16} /> Back
          </Button>
          <Button
            size="md"
            disabled={saving}
            onClick={() => {
              if (step === "basics") void s.saveBasics();
              else if (step === "skills") void s.saveSkills();
              else if (step === "preferences") void s.savePreferences();
              else goNext();
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {step === "verify" ? "Continue" : "Save & continue"}
            {!saving ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
