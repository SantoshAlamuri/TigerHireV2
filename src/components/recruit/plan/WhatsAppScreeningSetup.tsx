"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  defaultQuestionFromMustHave,
  MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY,
  MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST,
  type WhatsAppScreeningSetupPayload,
} from "@/lib/screening/whatsapp-screening-setup";
import type { PrescreenStage } from "@/lib/prescreen/types";
import {
  postShortlistIntro,
  prescreenQuestionText,
  screeningUploadIntro,
} from "@/lib/prescreen/messages";
import { filterPillClass } from "@/components/ui/filter-pill";

const STEPS = [
  { id: 1, title: "Write questions", subtitle: "What candidates answer on WhatsApp" },
  { id: 2, title: "Preview messages", subtitle: "Exactly what they will receive" },
  { id: 3, title: "Save", subtitle: "Lock questions for this role" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

type PhaseConfig = {
  stage: PrescreenStage;
  label: string;
  hint: string;
  maxQuestions: number;
  whenSent: string;
};

const PHASES: PhaseConfig[] = [
  {
    stage: "apply",
    label: "Pre-screen (at apply)",
    hint: "Sent when someone applies or is uploaded. A NO can gate them out before scoring.",
    maxQuestions: MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY,
    whenSent: "At apply / upload",
  },
  {
    stage: "post_shortlist",
    label: "After shortlist",
    hint: "Sent when the candidate is moved to Shortlisted. All questions are asked; NO does not auto-reject.",
    maxQuestions: MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST,
    whenSent: "When shortlisted",
  },
];

function stepClass(active: boolean, done: boolean): string {
  if (active) return "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]";
  if (done) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  return "border-white/15 bg-white/[0.03] text-white/45";
}

export function WhatsAppScreeningSetup({ jobId }: { jobId: string }) {
  const { data, loading, error, refetch } = useApiQuery<WhatsAppScreeningSetupPayload>(
    `/api/jobs/${jobId}/whatsapp-screening`,
  );

  const [phase, setPhase] = useState<PrescreenStage>("apply");
  const phaseConfig = PHASES.find((p) => p.stage === phase) ?? PHASES[0];

  const [step, setStep] = useState<StepId>(1);
  const [maxStep, setMaxStep] = useState<StepId>(1);
  const [applyQuestions, setApplyQuestions] = useState<string[]>([]);
  const [postShortlistQuestions, setPostShortlistQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedStages, setSavedStages] = useState<Set<PrescreenStage>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setApplyQuestions(data.applyQuestions.map((q) => q.questionText));
    setPostShortlistQuestions(data.postShortlistQuestions.map((q) => q.questionText));
  }, [data]);

  const questions = phase === "apply" ? applyQuestions : postShortlistQuestions;
  const setQuestions = phase === "apply" ? setApplyQuestions : setPostShortlistQuestions;

  const canEdit = Boolean(data?.whatsappEnabled && data?.jdBaseReady);
  const filledQuestions = useMemo(
    () => questions.map((q) => q.trim()).filter(Boolean),
    [questions],
  );

  const previewIntro = useMemo(() => {
    if (!data) return "";
    const params = {
      companyName: data.companyName,
      jobTitle: data.jobTitle,
      totalQuestions: filledQuestions.length || 1,
      candidateFirstName: "Priya",
    };
    return phase === "post_shortlist" ? postShortlistIntro(params) : screeningUploadIntro(params);
  }, [data, filledQuestions.length, phase]);

  const importFromMustHaves = useCallback(() => {
    if (phase !== "apply") {
      setNotice(
        "Must-have import is for pre-screen (at apply) only. Type post-shortlist questions manually.",
      );
      return;
    }
    if (!data?.mustHaves.length) {
      setNotice("Add must-haves in Scoring setup first, or type questions manually.");
      return;
    }
    setApplyQuestions(
      data.mustHaves
        .slice(0, MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY)
        .map((m) => defaultQuestionFromMustHave(m)),
    );
    setNotice("Imported from must-haves — edit wording below, then continue.");
  }, [data, phase]);

  function switchPhase(next: PrescreenStage) {
    setPhase(next);
    setStep(1);
    setMaxStep(1);
    setDraft("");
    setNotice(null);
  }

  async function handleSave() {
    if (filledQuestions.length === 0) {
      setNotice("Add at least one question.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/whatsapp-screening`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage: phase, questions: filledQuestions }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedStages((prev) => new Set(prev).add(phase));
      setStep(3);
      setMaxStep(3);
      await refetch();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function goToStep(next: StepId) {
    setStep(next);
    setMaxStep((m) => (next > m ? next : m));
    setNotice(null);
  }

  if (loading) {
    return (
      <section className="mt-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-4 h-48 w-full" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="mt-10 card-lifted p-6">
        <p className="text-sm text-red-400">
          {error ?? "Could not load WhatsApp screening setup."}
        </p>
      </section>
    );
  }

  const phaseSaved = savedStages.has(phase);

  return (
    <section id="whatsapp-screening-setup" className="mt-10 scroll-mt-24">
      <div className="card-lifted p-5 md:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            <MessageCircle size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="heading-section text-lg text-[var(--text)]">WhatsApp screening</h2>
            <p className="mt-1 text-sm text-white/60">
              Two rounds: knockout pre-screen at apply, then deeper questions after shortlist. Apply
              and upload candidates follow the same flow — answers land in the Screening tab.
            </p>
          </div>
        </div>

        {!data.whatsappEnabled ? (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            WhatsApp screening is off for your organisation. Turn it on under{" "}
            <a href="/recruit/settings/screening" className="font-medium underline">
              Settings → Screening
            </a>{" "}
            (Default mode: WhatsApp).
          </p>
        ) : null}

        {!data.jdBaseReady ? (
          <p className="mt-4 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            First complete <strong>Scoring setup</strong> above (Ideal Profile). Then return here to
            set WhatsApp questions.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <button
              key={p.stage}
              type="button"
              disabled={!canEdit}
              onClick={() => switchPhase(p.stage)}
              className={filterPillClass(phase === p.stage)}
            >
              {p.label}
              <span className="ml-1.5 text-white/40">
                (
                {p.stage === "apply"
                  ? applyQuestions.filter((q) => q.trim()).length
                  : postShortlistQuestions.filter((q) => q.trim()).length}
                )
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-white/55">
          <span className="font-medium text-white/70">{phaseConfig.whenSent}.</span>{" "}
          {phaseConfig.hint}
        </p>

        <ol className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
          {STEPS.map((s) => {
            const done = maxStep > s.id || (s.id === 3 && phaseSaved);
            const active = step === s.id;
            return (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  disabled={!canEdit || s.id > maxStep}
                  onClick={() => s.id <= maxStep && goToStep(s.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${stepClass(active, done)} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                    {done && !active ? <Check size={14} /> : s.id}
                  </span>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-xs opacity-80">{s.subtitle}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {notice ? (
          <p className="mt-4 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/75">
            {notice}
          </p>
        ) : null}

        {canEdit && step === 1 ? (
          <div className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white/85">
                Questions ({filledQuestions.length}/{phaseConfig.maxQuestions})
              </p>
              {phase === "apply" ? (
                <button
                  type="button"
                  onClick={importFromMustHaves}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/[0.04]"
                >
                  <Sparkles size={14} />
                  Start from must-haves
                </button>
              ) : null}
            </div>

            <ul className="space-y-3">
              {questions.map((q, index) => (
                <li key={`${phase}-${index}`}>
                  <label className="mb-1 block text-xs font-medium text-white/50">
                    Question {index + 1}
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={q}
                      onChange={(e) => {
                        const next = [...questions];
                        next[index] = e.target.value;
                        setQuestions(next);
                      }}
                      rows={2}
                      className="min-h-[4rem] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuestions(questions.filter((_, i) => i !== index))}
                      className="shrink-0 rounded-md border border-white/15 px-2 text-xs text-white/50 hover:text-white/80"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {questions.length < phaseConfig.maxQuestions ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a new yes/no question…"
                  className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = draft.trim();
                      if (!val) return;
                      setQuestions([...questions, val]);
                      setDraft("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = draft.trim();
                    if (!val) return;
                    setQuestions([...questions, val]);
                    setDraft("");
                  }}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
                >
                  + Add question
                </button>
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={filledQuestions.length === 0}
                onClick={() => {
                  goToStep(2);
                  setMaxStep(2);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                Continue to preview
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}

        {canEdit && step === 2 ? (
          <div className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm text-white/60">Preview (sample candidate name: Priya)</p>
            <div className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="whitespace-pre-wrap text-sm text-white/90">{previewIntro}</p>
              {filledQuestions.map((q, index) => (
                <p key={index} className="whitespace-pre-wrap text-sm text-white/85">
                  {prescreenQuestionText(index, filledQuestions.length, q)}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80"
              >
                Back to edit
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Save {phaseConfig.label.toLowerCase()}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && phaseSaved ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-semibold">
              Saved — {filledQuestions.length} question(s) for {phaseConfig.label.toLowerCase()}.
            </p>
            <p className="mt-2 text-emerald-200/90">
              {phase === "apply"
                ? "New applies and uploads with a phone number will receive these questions automatically."
                : "Moving a candidate to Shortlisted will trigger these questions (or use the bulk send script for existing shortlists)."}
            </p>
            <a
              href={`/recruit/jobs/${jobId}/screening`}
              className="mt-3 inline-block font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Open screening review table →
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
