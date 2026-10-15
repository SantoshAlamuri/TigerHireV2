"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import {
  Loader2,
  Star,
  MessageSquare,
  CheckCircle2,
  XCircle,
  User,
  FileText,
  Send,
  Sparkles,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { getFeedbackRecommendationTone } from "@/lib/status-tones";
import { ratingToneAt, type RatingTone } from "@/lib/feedback/scorecard";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  FeedbackTemplate,
  FeedbackTemplateField,
  FeedbackSubmission,
  PipelineStage,
} from "@/types";

interface PipelineCandidate {
  id: string;
  candidate_id: string;
  stage_id?: string | null;
  status: string;
  candidates: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

interface FeedbackResponse {
  id: string;
  template_id: string;
  pipeline_candidate_id: string;
  candidate_name?: string | null;
  reviewer_name?: string | null;
  overall_rating: number;
  recommendation: string;
  notes?: string | null;
  responses: Record<string, unknown>;
  created_at: string;
}

interface FeedbackData {
  feedback: FeedbackResponse[];
  stats?: {
    total?: number;
    average_rating?: number;
  };
}

function StarRating({
  rating,
  max = 5,
  interactive = false,
  onRatingChange,
}: {
  rating: number;
  max?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
}) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type={interactive ? "button" : undefined}
          onClick={interactive ? () => onRatingChange?.(i + 1) : undefined}
          disabled={!interactive}
          aria-label={`Rate ${i + 1} out of ${max} stars`}
          className={interactive ? "cursor-pointer transition hover:scale-110" : ""}
        >
          <Star
            size={20}
            className={
              i < Math.round(rating)
                ? "fill-amber-400 text-amber-400"
                : "fill-[var(--border)] text-[var(--border)]"
            }
          />
        </button>
      ))}
    </div>
  );
}

function recommendationLabel(rec: string): string {
  const labels: Record<string, string> = {
    strong_hire: "Strong Hire",
    hire: "Hire",
    no_hire: "No Hire",
    strong_no_hire: "Strong No Hire",
  };
  return labels[rec] ?? rec;
}

/** Sentiment colours for a scale option, by tone (worst → best). */
const SCALE_TONE_CLASSES: Record<RatingTone, { active: string; idle: string }> = {
  neg: {
    active: "border-red-400/60 bg-red-500/15 font-medium text-red-300",
    idle: "border-red-500/25 text-red-300/70 hover:bg-red-500/10",
  },
  warn: {
    active: "border-amber-400/60 bg-amber-500/15 font-medium text-amber-200",
    idle: "border-amber-500/25 text-amber-200/70 hover:bg-amber-500/10",
  },
  mid: {
    active: "border-white/45 bg-white/10 font-medium text-white",
    idle: "border-white/15 text-white/60 hover:bg-white/5",
  },
  pos: {
    active: "border-emerald-400/60 bg-emerald-500/15 font-medium text-emerald-200",
    idle: "border-emerald-500/25 text-emerald-200/70 hover:bg-emerald-500/10",
  },
  strongpos: {
    active: "border-teal-300/60 bg-teal-400/15 font-medium text-teal-100",
    idle: "border-teal-400/25 text-teal-100/70 hover:bg-teal-400/10",
  },
};

/** Greenhouse-style scale rating: labelled options (worst → best); stores the 1-based index. */
function ScaleRating({
  scale,
  value,
  onChange,
}: {
  scale: string[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {scale.map((label, i) => {
        const v = i + 1;
        const active = value === v;
        const tone = SCALE_TONE_CLASSES[ratingToneAt(i, scale.length)];
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              active ? tone.active : tone.idle
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FeedbackFormField({
  field,
  value,
  onChange,
}: {
  field: FeedbackTemplateField;
  value: string | number;
  onChange: (value: string | number) => void;
}) {
  const fieldId = `field-${field.label.toLowerCase().replace(/\s+/g, "-")}`;
  // Legacy fields kept guidance in `description`; select kept its options there.
  const guidance = field.guidance ?? (field.type === "select" ? undefined : field.description);

  if (field.type === "rating" || field.type === "yes_no") {
    const numericValue = typeof value === "number" ? value : Number(value) || 0;
    const scale =
      field.type === "yes_no"
        ? ["No", "Yes"]
        : field.scale && field.scale.length >= 2
          ? field.scale
          : null;
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {field.label}
          {field.required && <span className="text-red-400">*</span>}
        </label>
        {guidance ? <p className="mb-2 text-xs text-white/60">{guidance}</p> : null}
        {scale ? (
          <ScaleRating scale={scale} value={numericValue} onChange={(r) => onChange(r)} />
        ) : (
          <StarRating rating={numericValue} interactive onRatingChange={(r) => onChange(r)} />
        )}
      </div>
    );
  }

  if (field.type === "select") {
    const options =
      field.options && field.options.length > 0
        ? field.options
        : field.description
          ? field.description
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : [];
    return (
      <div>
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {field.label}
          {field.required && <span className="text-red-400">*</span>}
        </label>
        {field.description && options.length === 0 ? (
          <p className="mb-2 text-xs text-white/60">{field.description}</p>
        ) : null}
        <select
          id={fieldId}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {field.label}
          {field.required && <span className="text-red-400">*</span>}
        </label>
        {field.description ? (
          <p className="mb-2 text-xs text-white/60">{field.description}</p>
        ) : null}
        <input
          id={fieldId}
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          required={field.required}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
        {field.label}
        {field.required && <span className="text-red-400">*</span>}
      </label>
      {field.description ? <p className="mb-2 text-xs text-white/60">{field.description}</p> : null}
      <textarea
        id={fieldId}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        rows={3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
      />
    </div>
  );
}

export default function JobFeedbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    responses: Record<string, string | number>;
    overall_rating: number;
    recommendation: string;
    notes: string;
  }>({
    responses: {},
    overall_rating: 0,
    recommendation: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiEvidence, setAiEvidence] = useState<Record<string, string>>({});
  const [aiNotice, setAiNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleDraftFromNotetaker() {
    if (!selectedTemplateId || !selectedCandidateId) return;
    setAiNotice(null);
    setAiDrafting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/feedback/scorecard-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          template_id: selectedTemplateId,
          pipeline_candidate_id: selectedCandidateId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        draft?: {
          fields: { label: string; value: number | string; evidence?: string }[];
          recommendation?: string;
          overall_rating?: number;
          notes?: string;
        };
        error?: string;
      };
      if (!res.ok || !data.draft) {
        setAiNotice({ type: "error", text: data.error ?? "Couldn't draft from the notetaker." });
        return;
      }
      const responses: Record<string, string | number> = {};
      const evidence: Record<string, string> = {};
      for (const f of data.draft.fields) {
        responses[f.label] = f.value;
        if (f.evidence) evidence[f.label] = f.evidence;
      }
      // Pre-fill per-competency responses + evidence only. The overall rating and
      // the hire/no-hire recommendation are deliberately NOT seeded from the AI —
      // the human must set the verdict themselves. (#354)
      setFormData((prev) => ({
        responses: { ...prev.responses, ...responses },
        overall_rating: prev.overall_rating,
        recommendation: prev.recommendation,
        notes: prev.notes || data.draft!.notes || "",
      }));
      setAiEvidence(evidence);
      setAiNotice({
        type: "ok",
        text: "Drafted per-question notes from the AI notetaker. Set the overall rating and recommendation yourself, and review every field before submitting.",
      });
    } catch {
      setAiNotice({ type: "error", text: "Network error while drafting. Please retry." });
    } finally {
      setAiDrafting(false);
    }
  }

  const { data: jobData } = useApiQuery<{ job: { title: string } }>(id ? `/api/jobs/${id}` : null);

  const { data: pipelineData, loading: pipelineLoading } = useApiQuery<{
    candidates: PipelineCandidate[];
  }>(id ? `/api/jobs/${id}/pipeline/approve` : null);

  const { data: templatesData, loading: templatesLoading } = useApiQuery<{
    templates: FeedbackTemplate[];
  }>(id ? `/api/jobs/${id}/feedback-templates` : null);
  const { data: stagesData } = useApiQuery<{ stages: PipelineStage[] }>(
    id ? `/api/jobs/${id}/pipeline-stages` : null,
  );

  const {
    data: feedbackData,
    loading: feedbackLoading,
    refetch: refetchFeedback,
  } = useApiQuery<FeedbackData>(
    id && selectedCandidateId
      ? `/api/jobs/${id}/feedback?pipeline_candidate_id=${selectedCandidateId}`
      : null,
  );

  const { mutate: submitFeedback } = useOptimisticMutation<
    { feedback: unknown },
    FeedbackSubmission
  >(id ? `/api/jobs/${id}/feedback` : "", { method: "POST" });

  const jobTitle = jobData?.job?.title ?? "Job";
  const candidates = pipelineData?.candidates ?? [];
  const templates = templatesData?.templates ?? [];
  const feedback = feedbackData?.feedback ?? [];

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedCandidateId),
    [candidates, selectedCandidateId],
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );
  const stageById = useMemo(
    () => new Map((stagesData?.stages ?? []).map((stage) => [stage.id, stage])),
    [stagesData],
  );

  useEffect(() => {
    const fromQueryCandidateId =
      searchParams.get("pipeline_candidate_id") ?? searchParams.get("pipelineCandidateId");
    const fromQueryTemplateId = searchParams.get("template_id") ?? searchParams.get("templateId");

    if (
      fromQueryCandidateId &&
      candidates.some((candidate) => candidate.id === fromQueryCandidateId)
    ) {
      setSelectedCandidateId((prev) => prev ?? fromQueryCandidateId);
    }
    if (fromQueryTemplateId && templates.some((template) => template.id === fromQueryTemplateId)) {
      setSelectedTemplateId((prev) => prev ?? fromQueryTemplateId);
    }
  }, [searchParams, candidates, templates]);

  useEffect(() => {
    if (!selectedCandidateId || selectedTemplateId) return;
    const candidate = candidates.find((c) => c.id === selectedCandidateId);
    if (!candidate?.stage_id) return;
    const stageTemplateId = stageById.get(candidate.stage_id)?.feedback_template_id ?? null;
    if (stageTemplateId && templates.some((template) => template.id === stageTemplateId)) {
      setSelectedTemplateId(stageTemplateId);
    }
  }, [selectedCandidateId, selectedTemplateId, candidates, stageById, templates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !selectedCandidateId) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const result = await submitFeedback({
        template_id: selectedTemplateId,
        pipeline_candidate_id: selectedCandidateId,
        responses: formData.responses,
        overall_rating: formData.overall_rating,
        recommendation: formData.recommendation,
        notes: formData.notes || undefined,
      });

      if (result) {
        setSubmitSuccess(true);
        setFormData({
          responses: {},
          overall_rating: 0,
          recommendation: "",
          notes: "",
        });
        await refetchFeedback();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setSubmitError("Failed to submit feedback. Please try again.");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const loading = pipelineLoading || templatesLoading || feedbackLoading;

  return (
    <>
      <div className="mx-auto mb-6 max-w-6xl">
        <h2 className="heading-section text-lg text-[var(--text)]">Interview feedback</h2>
        <p className="mt-1 text-sm text-white/60">{jobTitle}</p>
      </div>
      <div className="mx-auto max-w-6xl space-y-6">
        {loading && !selectedCandidateId ? (
          <div className="space-y-6">
            <div className="card-lifted p-6">
              <Skeleton className="mb-4 h-6 w-48" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-xl border border-white/10 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card-lifted space-y-3 p-6">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <div className="card-lifted space-y-3 p-6">
                <Skeleton className="h-6 w-36" />
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Candidate Selection */}
            <div className="card-lifted p-6 backdrop-blur-md">
              <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
                <User size={20} className="text-[var(--accent)]" />
                Select Candidate
              </h2>
              {candidates.length === 0 ? (
                <p className="text-sm text-white/60">No pipeline candidates found for this job.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {candidates.map((candidate) => {
                    const candidateFeedback = feedback.filter(
                      (f) => f.pipeline_candidate_id === candidate.id,
                    );
                    const hasFeedback = candidateFeedback.length > 0;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => {
                          setSelectedCandidateId(candidate.id);
                          setSelectedTemplateId(null);
                          setFormData({
                            responses: {},
                            overall_rating: 0,
                            recommendation: "",
                            notes: "",
                          });
                        }}
                        className={`rounded-xl border p-4 text-left transition ${
                          selectedCandidateId === candidate.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/15"
                            : "border-[var(--border)] bg-[var(--bg-elevated)]/50 hover:border-[var(--accent)]/30"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="heading-card truncate text-sm font-semibold text-[var(--text)]">
                              {candidate.candidates?.name ?? "Unknown Candidate"}
                            </p>
                            <p className="text-body mt-0.5 truncate text-xs text-white/60">
                              {candidate.candidates?.email ?? ""}
                            </p>
                          </div>
                          {hasFeedback && (
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                          )}
                        </div>
                        {hasFeedback && (
                          <p className="text-body mt-2 text-xs text-white/60">
                            {candidateFeedback.length} feedback submission
                            {candidateFeedback.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Feedback Form & History */}
            {selectedCandidateId && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Feedback Form */}
                <div className="card-lifted p-6 backdrop-blur-md">
                  <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
                    <FileText size={20} className="text-[var(--accent)]" />
                    Submit Feedback
                  </h2>

                  {templates.length === 0 ? (
                    <p className="text-sm text-white/60">
                      No feedback templates available. Please create a template first.
                    </p>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Template Selection */}
                      <div>
                        <label
                          htmlFor="template-select"
                          className="mb-1.5 block text-sm font-medium text-[var(--text)]"
                        >
                          Feedback Template <span className="text-red-400">*</span>
                        </label>
                        <select
                          id="template-select"
                          value={selectedTemplateId || ""}
                          onChange={(e) => {
                            setSelectedTemplateId(e.target.value);
                            setFormData({
                              responses: {},
                              overall_rating: 0,
                              recommendation: "",
                              notes: "",
                            });
                          }}
                          required
                          aria-label="Select feedback template"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
                        >
                          <option value="">Select a template...</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Template Fields */}
                      {selectedTemplate && (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={handleDraftFromNotetaker}
                              disabled={aiDrafting}
                              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:opacity-50"
                            >
                              {aiDrafting ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Sparkles size={15} />
                              )}
                              Draft from AI notetaker
                            </button>
                            <span className="text-xs text-white/45">
                              Pre-fills from the interview transcript — you review and submit.
                            </span>
                          </div>
                          {aiNotice ? (
                            <div
                              className={`rounded-lg border px-3 py-2 text-sm ${
                                aiNotice.type === "ok"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                  : "border-red-500/30 bg-red-500/10 text-red-300"
                              }`}
                            >
                              {aiNotice.text}
                            </div>
                          ) : null}
                          {selectedTemplate.fields.map((field, idx) => (
                            <div key={idx} className="space-y-1.5">
                              <FeedbackFormField
                                field={field}
                                value={formData.responses[field.label] ?? ""}
                                onChange={(value) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    responses: {
                                      ...prev.responses,
                                      [field.label]: value,
                                    },
                                  }))
                                }
                              />
                              {aiEvidence[field.label] ? (
                                <p className="flex items-start gap-1.5 text-xs italic text-white/45">
                                  <Sparkles
                                    size={11}
                                    className="mt-0.5 shrink-0 text-[var(--accent)]/70"
                                  />
                                  AI: &ldquo;{aiEvidence[field.label]}&rdquo;
                                </p>
                              ) : null}
                            </div>
                          ))}

                          {/* Overall Rating */}
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                              Overall Rating <span className="text-red-400">*</span>
                            </label>
                            <StarRating
                              rating={formData.overall_rating}
                              interactive
                              onRatingChange={(rating) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  overall_rating: rating,
                                }))
                              }
                            />
                          </div>

                          {/* Recommendation */}
                          <div>
                            <label
                              htmlFor="recommendation-select"
                              className="mb-1.5 block text-sm font-medium text-[var(--text)]"
                            >
                              Recommendation <span className="text-red-400">*</span>
                            </label>
                            <select
                              id="recommendation-select"
                              value={formData.recommendation}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  recommendation: e.target.value,
                                }))
                              }
                              required
                              aria-label="Select recommendation"
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
                            >
                              <option value="">Select...</option>
                              <option value="strong_hire">Strong Hire</option>
                              <option value="hire">Hire</option>
                              <option value="no_hire">No Hire</option>
                              <option value="strong_no_hire">Strong No Hire</option>
                            </select>
                          </div>

                          {/* Notes */}
                          <div>
                            <label
                              htmlFor="notes-textarea"
                              className="mb-1.5 block text-sm font-medium text-[var(--text)]"
                            >
                              Additional Notes
                            </label>
                            <textarea
                              id="notes-textarea"
                              value={formData.notes}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  notes: e.target.value,
                                }))
                              }
                              rows={4}
                              placeholder="Enter any additional notes or comments..."
                              aria-label="Additional notes"
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </div>

                          {submitError && (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
                              {submitError}
                            </div>
                          )}

                          {submitSuccess && (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-400">
                              <CheckCircle2 size={16} />
                              Feedback submitted successfully!
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={submitting}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                <Send size={16} />
                                Submit Feedback
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </form>
                  )}
                </div>

                {/* Feedback History */}
                <div className="card-lifted p-6 backdrop-blur-md">
                  <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
                    <MessageSquare size={20} className="text-[var(--accent)]" />
                    Past Feedback
                  </h2>

                  {feedbackLoading ? (
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="rounded-lg border border-white/10 p-4">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="mt-2 h-3 w-1/2" />
                          <Skeleton className="mt-3 h-12 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : feedback.length === 0 ? (
                    <div className="py-10 text-center">
                      <MessageSquare size={40} className="mx-auto mb-3 text-white/60" />
                      <p className="text-sm text-white/60">
                        No feedback submitted yet for this candidate.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {feedback.map((item) => (
                        <div key={item.id} className="card-lifted p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[var(--text)]">
                                {item.reviewer_name ?? "Anonymous Reviewer"}
                              </p>
                              <p className="text-body mt-0.5 text-xs text-white/60">
                                {new Date(item.created_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <StarRating rating={item.overall_rating} />
                              <StatusBadge
                                tone={getFeedbackRecommendationTone(item.recommendation)}
                                size="sm"
                              >
                                {recommendationLabel(item.recommendation)}
                              </StatusBadge>
                            </div>
                          </div>
                          {item.notes && (
                            <p className="text-body mt-3 text-sm text-white/60">{item.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
