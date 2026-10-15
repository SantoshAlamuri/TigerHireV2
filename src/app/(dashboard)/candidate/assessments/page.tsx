"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getAssessmentStatusLabel,
  getAssessmentTypeLabel,
  type AssessmentStatus,
  type AssessmentType,
} from "@/lib/assessments/constants";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";

interface AssessmentRow {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  deadline_at: string;
  submission_text: string | null;
  submission_url: string | null;
  score: number | null;
  max_score: number | null;
  feedback: string | null;
}

function getAssessmentStatusTone(
  status: AssessmentStatus,
): "warning" | "info" | "success" | "danger" {
  switch (status) {
    case "pending":
      return "warning";
    case "submitted":
      return "info";
    case "scored":
      return "success";
    case "expired":
      return "danger";
    default:
      return "info";
  }
}

function AssessmentCard({
  assessment,
  draft,
  setDraft,
  onSubmitted,
  optimisticStatus,
  onOptimisticStatusChange,
}: {
  assessment: AssessmentRow;
  draft: Record<string, { submissionText: string; submissionUrl: string }>;
  setDraft: React.Dispatch<
    React.SetStateAction<Record<string, { submissionText: string; submissionUrl: string }>>
  >;
  onSubmitted: () => Promise<void>;
  optimisticStatus?: AssessmentRow["status"];
  onOptimisticStatusChange: (assessmentId: string, status: AssessmentRow["status"] | null) => void;
}) {
  const { toast } = useToast();
  const [started, setStarted] = useState(false);
  const effectiveStatus = optimisticStatus ?? assessment.status;
  const { mutate, loading } = useOptimisticMutation<
    Record<string, unknown>,
    { submissionText?: string; submissionUrl?: string }
  >(`/api/assessments/${assessment.id}/submit`, {
    method: "POST",
    onMutate: () => {
      onOptimisticStatusChange(assessment.id, "submitted");
      return () => onOptimisticStatusChange(assessment.id, null);
    },
    onSuccess: async () => {
      toast({ title: "Assessment submitted", tone: "success" });
      onOptimisticStatusChange(assessment.id, null);
      await onSubmitted();
    },
    onError: (error) => {
      toast({
        title: "Couldn't submit assessment",
        description: error.message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void submitAssessment();
          },
        },
      });
      onOptimisticStatusChange(assessment.id, null);
    },
  });

  async function submitAssessment() {
    const values = draft[assessment.id] ?? { submissionText: "", submissionUrl: "" };
    await mutate({
      submissionText: values.submissionText.trim() || undefined,
      submissionUrl: values.submissionUrl.trim() || undefined,
    });
  }

  return (
    <section className="card-lifted space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{assessment.title}</p>
          <p className="text-xs text-white/65">{getAssessmentTypeLabel(assessment.type)}</p>
          <p className="mt-1 text-xs text-white/45">
            Due {new Date(assessment.deadline_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={getAssessmentStatusTone(effectiveStatus)} size="sm">
            {getAssessmentStatusLabel(effectiveStatus)}
          </StatusBadge>
          {effectiveStatus === "scored" ? (
            <FitRing
              score={
                assessment.max_score && assessment.max_score > 0
                  ? Math.round(((assessment.score ?? 0) / assessment.max_score) * 100)
                  : 0
              }
              size={40}
            />
          ) : null}
        </div>
      </div>

      {effectiveStatus === "pending" ? (
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          {!started ? (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="inline-flex items-center rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
            >
              Start assessment
            </button>
          ) : (
            <div className="grid gap-2">
              <textarea
                rows={3}
                placeholder="Paste your written response (optional if URL is provided)"
                value={draft[assessment.id]?.submissionText ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [assessment.id]: {
                      submissionText: event.target.value,
                      submissionUrl: prev[assessment.id]?.submissionUrl ?? "",
                    },
                  }))
                }
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
              />
              <input
                type="url"
                placeholder="Submission URL (GitHub, GDrive, etc.)"
                value={draft[assessment.id]?.submissionUrl ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [assessment.id]: {
                      submissionText: prev[assessment.id]?.submissionText ?? "",
                      submissionUrl: event.target.value,
                    },
                  }))
                }
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitAssessment()}
                  className="justify-self-start rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit assessment"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStarted(false)}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {effectiveStatus === "submitted" ? (
        <p className="text-xs text-white/65">Submitted. Waiting for reviewer score.</p>
      ) : null}
      {effectiveStatus === "scored" && assessment.max_score && assessment.max_score > 0 ? (
        <p className="text-xs font-semibold text-emerald-200/90">
          Your result: {assessment.score ?? 0}/{assessment.max_score} (
          {Math.round(((assessment.score ?? 0) / assessment.max_score) * 100)}%)
        </p>
      ) : null}
      {effectiveStatus === "scored" && assessment.feedback ? (
        <p className="text-xs text-white/65">Feedback: {assessment.feedback}</p>
      ) : null}
      {effectiveStatus === "scored" && !assessment.feedback ? (
        <p className="text-xs text-white/50">No written feedback was added for this grade.</p>
      ) : null}
    </section>
  );
}

export default function CandidateAssessmentsPage() {
  const { data, loading, error, refetch } = useApiQuery<{ assessments: AssessmentRow[] }>(
    "/api/assessments",
  );
  const [draft, setDraft] = useState<
    Record<string, { submissionText: string; submissionUrl: string }>
  >({});
  const [optimisticStatusById, setOptimisticStatusById] = useState<
    Record<string, AssessmentRow["status"]>
  >({});

  return (
    <>
      <PageHeader title="Assessments" subtitle="Complete and submit assigned assessments." />
      <div className="card-lifted space-y-3 p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {!loading && (data?.assessments?.length ?? 0) === 0 ? (
          <p className="text-sm text-white/65">No assessments assigned right now.</p>
        ) : null}
        {(data?.assessments ?? []).map((assessment) => (
          <AssessmentCard
            key={assessment.id}
            assessment={assessment}
            draft={draft}
            setDraft={setDraft}
            optimisticStatus={optimisticStatusById[assessment.id]}
            onOptimisticStatusChange={(assessmentId, status) => {
              setOptimisticStatusById((prev) => {
                if (!status) {
                  const { [assessmentId]: _, ...rest } = prev;
                  return rest;
                }
                return { ...prev, [assessmentId]: status };
              });
            }}
            onSubmitted={async () => {
              await refetch({ silent: true });
            }}
          />
        ))}
      </div>
    </>
  );
}
