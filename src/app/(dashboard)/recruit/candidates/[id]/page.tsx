"use client";

import { useWorkspaceScroll } from "@/lib/v2/use-workspace-scroll";
import { patchWorkspaceQuery } from "@/lib/v2/workspace-query";
import { resolveApplicationSelection } from "@/lib/v2/application-selection";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Building2,
  Briefcase,
  Clock,
  IndianRupee,
  CheckCircle2,
  HelpCircle,
  Radio,
  ArrowLeft,
  Loader2,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";
import { CandidateVerdictActions } from "@/components/dashboard/CandidateVerdictActions";
import {
  CandidateDecisionBand,
  CandidateTriageRow,
  type DecisionGap,
} from "@/components/dashboard/CandidateDecisionStrip";
import { FitScoreFeedbackPrompt } from "@/components/dashboard/FitScoreFeedbackPrompt";
import { CandidateNotesSection } from "@/components/dashboard/CandidateNotesSection";
import { CandidateAssessmentState } from "@/components/dashboard/CandidateAssessmentState";
import { CandidateResumeAccess } from "@/components/dashboard/CandidateResumeAccess";
import { RecruitCandidateOfferDraft } from "@/components/dashboard/RecruitCandidateOfferDraft";
import { ApplicationCommunicationsFeed } from "@/components/dashboard/ApplicationCommunicationsFeed";
import { CandidateScreeningCard } from "@/components/dashboard/CandidateScreeningCard";
import { InterviewNotetakerCard } from "@/components/interviews/InterviewNotetakerCard";
import {
  fetchPipelineStages,
  type PipelineStage as JobPipelineStage,
} from "@/lib/api/fetch-pipeline-stages";
import { isInterviewerIdentityV1UiEnabled } from "@/lib/rollouts/interviewer-identity-ui";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { mapDbCandidateToView, mapDbFitScoreToView } from "@/lib/mappers";
import { computeReadiness } from "@/lib/fitscore/readiness";
import { screeningFlagLabel } from "@/lib/screening/candidate-flag";
import type { ApplicationStatus } from "@/types";

const APPLICATION_STATUS_VALUES: readonly ApplicationStatus[] = [
  "applied",
  "viewed",
  "shortlisted",
  "rejected",
  "hired",
  "withdrawn",
];

function normalizeApplicationStatus(status: string | null | undefined): ApplicationStatus {
  return APPLICATION_STATUS_VALUES.includes(status as ApplicationStatus)
    ? (status as ApplicationStatus)
    : "applied";
}

function formatSalary(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  return `₹${value.toLocaleString()}`;
}

const FF_INTERVIEW_ROUND_LADDER = isInterviewerIdentityV1UiEnabled();

function formatStageInterviewerLabel(st: JobPipelineStage): string {
  const intr = st.interviewer;
  if (intr?.full_name?.trim()) return intr.full_name.trim();
  if (intr?.email?.trim()) return intr.email.trim();
  const n = st.interviewer_name?.trim();
  const e = st.interviewer_email?.trim();
  if (n && e) return `${n} (${e})`;
  if (n) return n;
  if (e) return e;
  return "—";
}

interface RecruiterApplicationRow {
  id: string;
  job_id: string;
  status: string | null;
  created_at: string;
  current_ctc_lpa: number | null;
  expected_ctc_lpa: number | null;
  notice_period_days: number | null;
  offers_in_hand: number | null;
  available_from: string | null;
  relocation_willingness: "yes" | "no" | "negotiable" | null;
  jobs?: { title: string | null } | { title: string | null }[] | null;
}

interface PipelineCandidateRow {
  id?: string | null;
  candidate_id?: string | null;
  job_id?: string | null;
  stage_id?: string | null;
  status?: string | null;
  stageName?: string | null;
  stageType?: string | null;
  referrer_name?: string | null;
  parent_referrer_name?: string | null;
  referrer_org_verified?: boolean;
  referrer_verified_org_name?: string | null;
}

interface HireabilityDraft {
  currentCtcLpa: string;
  expectedCtcLpa: string;
  noticePeriodDays: string;
  offersInHand: string;
  availableFrom: string;
  relocationWillingness: "" | "yes" | "no" | "negotiable";
}

function toHireabilityDraft(application: RecruiterApplicationRow): HireabilityDraft {
  return {
    currentCtcLpa: application.current_ctc_lpa != null ? String(application.current_ctc_lpa) : "",
    expectedCtcLpa:
      application.expected_ctc_lpa != null ? String(application.expected_ctc_lpa) : "",
    noticePeriodDays:
      application.notice_period_days != null ? String(application.notice_period_days) : "",
    offersInHand: application.offers_in_hand != null ? String(application.offers_in_hand) : "",
    availableFrom: application.available_from ?? "",
    relocationWillingness: application.relocation_willingness ?? "",
  };
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Applied";
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHireabilityLpa(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value} LPA`;
}

function formatHireabilityDate(value: string | null | undefined): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function formatHireabilityText(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function screeningFlagClass(flag: string): string {
  switch (flag) {
    case "completed":
      return "text-emerald-300";
    case "in_progress":
      return "text-blue-300";
    case "attention":
      return "text-amber-300";
    default:
      return "text-[var(--text-muted)]";
  }
}

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canManageHireability = user?.role === "recruiter" || user?.role === "leadership";

  const {
    data: candidateData,
    loading,
    error,
    refetch: refetchCandidate,
  } = useApiQuery<{ candidate: Record<string, unknown>; isUnlocked?: boolean }>(
    params.id ? `/api/candidates/${params.id}` : null,
  );

  const {
    data: scoresData,
    error: scoresError,
    refetch: refetchScores,
  } = useApiQuery<{
    scores: Record<string, unknown>[];
  }>(params.id ? "/api/fit-score" : null, params.id ? { candidateId: params.id } : undefined);

  const { data: pipelineData, refetch: refetchPipeline } = useApiQuery<{
    pipeline: PipelineCandidateRow[];
  }>(params.id ? "/api/my-pipeline" : null);

  const { data: resumesData } = useApiQuery<{
    versions: Array<{ id: string; file_name: string; view_url?: string; created_at?: string }>;
  }>(params.id ? `/api/candidates/${params.id}/resumes` : null);

  const {
    data: applicationsData,
    loading: applicationsLoading,
    refetch: refetchApplications,
  } = useApiQuery<{
    applications: RecruiterApplicationRow[];
  }>(
    params.id && canManageHireability ? "/api/applications" : null,
    params.id && canManageHireability
      ? { limit: 100, candidateId: params.id, jobId: searchParams.get("jobId") || undefined }
      : undefined,
  );

  useWorkspaceScroll(
    `${user?.id ?? "anonymous"}:profile:${params.id}:${searchParams.get("applicationId") ?? ""}:${searchParams.get("tab") ?? "evidence"}`,
    !loading && !applicationsLoading,
  );
  const [hireabilityOpen, setHireabilityOpen] = useState(true);
  /** True content tabs — exactly one panel renders below the triage row. */
  const [activeTab, setActiveTab] = useState<
    "evidence" | "profile" | "logistics" | "activity" | "notes"
  >(() => {
    const tab = searchParams.get("tab");
    return tab === "profile" || tab === "logistics" || tab === "activity" || tab === "notes"
      ? tab
      : "evidence";
  });
  const [showHireabilityForm, setShowHireabilityForm] = useState(false);
  const [hireabilitySaving, setHireabilitySaving] = useState(false);
  const [stageMoveSaving, setStageMoveSaving] = useState(false);
  const [hireabilityNotice, setHireabilityNotice] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>(
    () => searchParams.get("applicationId") ?? "",
  );
  const requestedApplicationId = searchParams.get("applicationId") ?? "";
  useEffect(() => {
    setSelectedApplicationId(requestedApplicationId);
  }, [requestedApplicationId, params.id]);
  const [stageOptions, setStageOptions] = useState<JobPipelineStage[]>([]);
  const [stageOptionsLoading, setStageOptionsLoading] = useState(false);
  const [ladderStages, setLadderStages] = useState<JobPipelineStage[]>([]);
  const [ladderLoading, setLadderLoading] = useState(false);
  const [showStageTimeline, setShowStageTimeline] = useState(false);
  const [targetStageId, setTargetStageId] = useState<string>("");
  const [stageMoveNotice, setStageMoveNotice] = useState<string | null>(null);
  const [hireabilityDraft, setHireabilityDraft] = useState<HireabilityDraft>({
    currentCtcLpa: "",
    expectedCtcLpa: "",
    noticePeriodDays: "",
    offersInHand: "",
    availableFrom: "",
    relocationWillingness: "",
  });

  const { data: applicationDetail } = useApiQuery<{
    screeningAnswers?: {
      questionId: string;
      questionText: string;
      failOnYes: boolean;
      sortOrder: number;
      answerYes: boolean;
      passed: boolean;
    }[];
    prescreenAnswers?: {
      questionId: string;
      questionText: string;
      phase: "apply" | "post_shortlist";
      phaseLabel: string;
      answer: string;
      passed: boolean;
      sortOrder: number;
    }[];
  }>(
    canManageHireability && selectedApplicationId
      ? `/api/applications/${encodeURIComponent(selectedApplicationId)}`
      : null,
  );

  const recruiterApplications = useMemo(
    () => applicationsData?.applications ?? [],
    [applicationsData],
  );

  const pipelineByJobId = useMemo(() => {
    const map = new Map<string, PipelineCandidateRow>();
    for (const row of pipelineData?.pipeline ?? []) {
      if (row.job_id) map.set(row.job_id, row);
    }
    return map;
  }, [pipelineData?.pipeline]);

  const applicationByJobId = useMemo(() => {
    const map = new Map<string, RecruiterApplicationRow>();
    for (const app of recruiterApplications) {
      if (app.job_id && !map.has(app.job_id)) map.set(app.job_id, app);
    }
    return map;
  }, [recruiterApplications]);

  useEffect(() => {
    if (!canManageHireability || applicationsLoading) return;
    if (recruiterApplications.length === 0) {
      setSelectedApplicationId("");
      setHireabilityDraft({
        currentCtcLpa: "",
        expectedCtcLpa: "",
        noticePeriodDays: "",
        offersInHand: "",
        availableFrom: "",
        relocationWillingness: "",
      });
      return;
    }

    const nextId = resolveApplicationSelection(
      selectedApplicationId,
      recruiterApplications,
      applicationsLoading,
    );
    setSelectedApplicationId(nextId);
    setShowHireabilityForm(false);
    const selected = recruiterApplications.find((app) => app.id === nextId);
    if (selected) setHireabilityDraft(toHireabilityDraft(selected));
  }, [applicationsLoading, canManageHireability, recruiterApplications, selectedApplicationId]);

  const selectedApplication =
    recruiterApplications.find((app) => app.id === selectedApplicationId) ?? null;
  const hasHireabilityData = Boolean(
    selectedApplication &&
    (selectedApplication.current_ctc_lpa != null ||
      selectedApplication.expected_ctc_lpa != null ||
      selectedApplication.notice_period_days != null ||
      selectedApplication.offers_in_hand != null ||
      selectedApplication.available_from != null ||
      selectedApplication.relocation_willingness != null),
  );
  const selectedPipelineCandidate = useMemo(() => {
    if (!selectedApplication?.job_id) return null;
    return (
      (pipelineData?.pipeline ?? []).find(
        (row) => row.candidate_id === params.id && row.job_id === selectedApplication.job_id,
      ) ?? null
    );
  }, [params.id, pipelineData?.pipeline, selectedApplication]);

  const showOfferDraftFlow = useMemo(() => {
    if (!selectedApplication?.job_id) return false;
    const pipelineRows = pipelineData?.pipeline ?? [];
    const matchingPipeline = pipelineRows.find(
      (row) => row.candidate_id === params.id && row.job_id === selectedApplication.job_id,
    );
    if (!matchingPipeline) return false;
    const stageType = String(matchingPipeline.stageType ?? "").toLowerCase();
    // Strict gating: show offer flow only on explicit offer stage type.
    return stageType === "offer";
  }, [params.id, pipelineData?.pipeline, selectedApplication]);

  const saveHireability = useCallback(async () => {
    if (!selectedApplicationId) return;

    const noticePeriodValue = parseOptionalNumber(hireabilityDraft.noticePeriodDays);
    const offersInHandValue = parseOptionalNumber(hireabilityDraft.offersInHand);
    if (
      (noticePeriodValue != null && !Number.isInteger(noticePeriodValue)) ||
      (offersInHandValue != null && !Number.isInteger(offersInHandValue))
    ) {
      setHireabilityNotice("Notice period and offers in hand must be whole numbers.");
      return;
    }

    setHireabilitySaving(true);
    setHireabilityNotice(null);
    try {
      const response = await fetch(`/api/applications/${selectedApplicationId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCtcLpa: parseOptionalNumber(hireabilityDraft.currentCtcLpa),
          expectedCtcLpa: parseOptionalNumber(hireabilityDraft.expectedCtcLpa),
          noticePeriodDays: noticePeriodValue,
          offersInHand: offersInHandValue,
          availableFrom: hireabilityDraft.availableFrom || null,
          relocationWillingness: hireabilityDraft.relocationWillingness || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setHireabilityNotice(payload.error || "Failed to save hireability fields.");
        return;
      }
      setHireabilityNotice("Hireability fields saved.");
      await refetchApplications();
    } finally {
      setHireabilitySaving(false);
    }
  }, [hireabilityDraft, refetchApplications, selectedApplicationId]);

  useEffect(() => {
    if (!FF_INTERVIEW_ROUND_LADDER || !hireabilityOpen || !selectedApplication?.job_id) {
      setLadderStages([]);
      return;
    }
    setLadderLoading(true);
    void fetchPipelineStages(selectedApplication.job_id, { forceFresh: true })
      .then((stages) => {
        const sorted = [...stages].sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0));
        setLadderStages(sorted);
      })
      .finally(() => setLadderLoading(false));
  }, [hireabilityOpen, selectedApplication?.job_id]);

  useEffect(() => {
    if (!selectedApplication?.job_id || !hireabilityOpen) {
      setStageOptions([]);
      setTargetStageId("");
      return;
    }
    setStageOptionsLoading(true);
    void fetchPipelineStages(selectedApplication.job_id, { forceFresh: true })
      .then((stages) => {
        const sorted = [...stages].sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0));
        setStageOptions(sorted);
      })
      .finally(() => setStageOptionsLoading(false));
  }, [hireabilityOpen, selectedApplication?.job_id]);

  useEffect(() => {
    setStageMoveNotice(null);
    setShowStageTimeline(false);
    if (selectedPipelineCandidate?.stage_id) {
      const currentIdx = stageOptions.findIndex(
        (stage) => stage.id === selectedPipelineCandidate.stage_id,
      );
      const nextStage = currentIdx >= 0 ? stageOptions[currentIdx + 1] : null;
      setTargetStageId(nextStage?.id ?? selectedPipelineCandidate.stage_id);
      return;
    }
    if (stageOptions.length > 0) {
      setTargetStageId(stageOptions[0]?.id ?? "");
    } else {
      setTargetStageId("");
    }
  }, [selectedPipelineCandidate?.stage_id, stageOptions]);

  const currentLadderStageIndex = useMemo(() => {
    if (!selectedPipelineCandidate?.stage_id) return -1;
    return ladderStages.findIndex((stage) => stage.id === selectedPipelineCandidate.stage_id);
  }, [ladderStages, selectedPipelineCandidate?.stage_id]);

  const nextLadderStage =
    currentLadderStageIndex >= 0 ? ladderStages[currentLadderStageIndex + 1] : null;

  const moveStage = useCallback(async () => {
    if (!selectedApplication?.job_id || !targetStageId) {
      setStageMoveNotice("Select a valid job stage before moving.");
      return;
    }
    if (!selectedPipelineCandidate?.id) {
      setStageMoveNotice(
        "This candidate is not yet in the pipeline for the selected job. Shortlist or add to pipeline first, then move stage.",
      );
      return;
    }
    if (targetStageId === selectedPipelineCandidate.stage_id) {
      setStageMoveNotice("Candidate is already in that stage.");
      return;
    }
    setStageMoveSaving(true);
    setStageMoveNotice(null);
    try {
      const response = await fetch(
        `/api/jobs/${selectedApplication.job_id}/pipeline/candidates/${selectedPipelineCandidate.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id: targetStageId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStageMoveNotice(payload.error || "Failed to move stage.");
        return;
      }
      setStageMoveNotice("Stage updated.");
      await refetchPipeline();
      await refetchApplications();
    } finally {
      setStageMoveSaving(false);
    }
  }, [
    refetchApplications,
    refetchPipeline,
    selectedApplication?.job_id,
    selectedPipelineCandidate?.id,
    selectedPipelineCandidate?.stage_id,
    targetStageId,
  ]);

  const interviewEligibleJobIds = useMemo(() => {
    const map = new Map<string, boolean>();
    const rows = pipelineData?.pipeline ?? [];
    for (const row of rows) {
      if (!row || row.candidate_id !== params.id || !row.job_id) continue;
      const status = String(row.status ?? "").toLowerCase();
      const stage = String(row.stageName ?? "").toLowerCase();
      const isInterviewedOrBeyond =
        status === "hired" || status === "rejected" || stage.includes("interview");
      if (isInterviewedOrBeyond) map.set(row.job_id, true);
    }
    return map;
  }, [params.id, pipelineData?.pipeline]);

  if (loading) {
    return (
      <>
        <PageHeader title="Candidate" subtitle="Loading..." />
        <div className="space-y-4 py-4">
          <div className="card-lifted p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="mt-3 h-4 w-48" />
            <Skeleton className="mt-6 h-24 w-full" />
          </div>
          <div className="card-lifted p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </div>
      </>
    );
  }

  const candidateRaw = candidateData?.candidate;

  if (error || !candidateRaw) {
    return (
      <>
        <PageHeader title="Candidate" subtitle="Not found" />
        <div className="card-lifted p-12 text-center">
          <p className="heading-card text-lg text-[var(--text)]">Candidate not found</p>
          <p className="text-body mt-2 text-sm text-[var(--text-muted)]">
            No candidate exists with ID &ldquo;{params.id}&rdquo;
          </p>
          {error && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => refetchCandidate()}
                className="rounded-md border border-[var(--border-interactive)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-white/[0.04]"
              >
                Retry
              </button>
            </div>
          )}
          <Link
            href="/recruit/candidates"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            <ArrowLeft size={16} />
            Back to candidate pool
          </Link>
        </div>
      </>
    );
  }

  const candidate = mapDbCandidateToView(candidateRaw);
  const fitScores =
    scoresData?.scores?.map((row) => {
      const mapped = mapDbFitScoreToView(row);
      const raw = row.parse_quality_score;
      if (mapped.parseQualityScore == null && raw != null) {
        const fallback = Number(raw);
        // 0 is treated as unset for hybrid rows in mapDbFitScoreToView; don't re-inject it here.
        if (Number.isFinite(fallback) && fallback > 0) {
          mapped.parseQualityScore = fallback;
        }
      }
      return mapped;
    }) ?? [];
  const displayName = candidate.name;

  const screeningFlag = candidate.screeningFlag ?? "not_started";
  const rawExtras = candidateRaw as Record<string, unknown>;
  const contactEmail = normalizeContactDetail(candidateRaw.email);
  const contactPhone =
    normalizeContactDetail(candidateRaw.phone) ??
    normalizeContactDetail(rawExtras.mobile) ??
    normalizeContactDetail(rawExtras.phone_number) ??
    normalizeContactDetail(rawExtras.mobile_number);
  const cvRawText =
    typeof candidateRaw.cv_raw_text === "string" ? candidateRaw.cv_raw_text.trim() : "";
  const legacyResumeUrl =
    (typeof candidateRaw.resume_url === "string" && candidateRaw.resume_url.trim()) ||
    (typeof candidateRaw.cv_url === "string" && candidateRaw.cv_url.trim()) ||
    "";
  const from = searchParams.get("from");
  const returnTo = searchParams.get("returnTo");
  const isSafePipelineReturnTo =
    typeof returnTo === "string" &&
    (/^\/recruit\/candidates(?:\?|$)/.test(returnTo) ||
      returnTo.startsWith("/recruit/pipeline") ||
      returnTo.startsWith("/company/my-pipeline") ||
      /^\/recruit\/v2\/jobs\/[^/?#]+\/review(?:\?|$)/.test(returnTo));
  const backHref = isSafePipelineReturnTo
    ? returnTo
    : from === "pipeline"
      ? user?.role === "hiring_manager"
        ? "/company/my-pipeline"
        : "/recruit/pipeline"
      : "/recruit/candidates";

  // ── Decision Strip inputs ────────────────────────────────────────────────
  const primaryScore = fitScores[0] ?? null;
  const stripHasCv = Boolean(
    (resumesData?.versions?.length ?? 0) > 0 || cvRawText || legacyResumeUrl,
  );
  const stripReadiness = selectedApplication
    ? computeReadiness({
        noticePeriodDays: selectedApplication.notice_period_days,
        availableFrom: selectedApplication.available_from,
        relocationWillingness: selectedApplication.relocation_willingness,
        offersInHand: selectedApplication.offers_in_hand,
        hasCv: stripHasCv,
        screeningCompleted: screeningFlag === "completed",
      })
    : null;
  const stripGaps: DecisionGap[] = [];
  if (selectedApplication && !stripHasCv) {
    stripGaps.push({
      key: "cv",
      label: "No CV on file",
      actionLabel: "Request on WhatsApp",
      action: { kind: "preset", preset: "request_cv" },
    });
  }
  if (screeningFlag !== "completed") {
    stripGaps.push({
      key: "screening",
      label: "Screening not completed",
      actionLabel: "Start screening",
      action: { kind: "anchor", href: "#tab:activity" },
    });
  }
  if (
    selectedApplication &&
    selectedApplication.notice_period_days == null &&
    selectedApplication.expected_ctc_lpa == null
  ) {
    stripGaps.push({
      key: "logistics",
      label: "Notice / CTC unknown — improves Ready accuracy",
      actionLabel: "Ask on WhatsApp",
      action: { kind: "preset", preset: "ask_logistics" },
    });
  }
  if (
    primaryScore &&
    (primaryScore.idealMatchPct == null || primaryScore.idealMatchPct === 0) &&
    selectedApplication?.job_id
  ) {
    stripGaps.push({
      key: "icp",
      label: "No Ideal Profile baseline",
      actionLabel: "Set up ICP",
      action: {
        kind: "link",
        href: `/recruit/jobs/${selectedApplication.job_id}#ideal-profile-setup`,
      },
    });
  }

  return (
    <>
      {/* Identity + verdict live in the Decision Band; only the Back action sits above it. */}
      <div className="mb-6 flex justify-end">
        <Link
          href={backHref}
          className="flex items-center gap-2 rounded-md border border-[var(--border-interactive)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <div className="space-y-8">
        {/* Row 1 · Decision band — who + verdict, the four-score scoreband, and the
            actions (status + schedule). Concept v3 "Decision Strip" made real. */}
        <CandidateDecisionBand
          candidateName={displayName}
          statusChips={[
            formatStatusLabel(selectedApplication?.status ?? null),
            ...(stripHasCv ? [] : ["CV missing"]),
          ]}
          metaLine={[
            candidate.roleTitle && candidate.roleTitle.toLowerCase() !== "professional"
              ? candidate.roleTitle
              : null,
            candidate.currentCompany || null,
            candidate.locationCity || null,
            candidate.seniorityLevel,
            `${candidate.yearsExperience} yrs`,
            contactEmail ?? null,
          ]
            .filter(Boolean)
            .join(" · ")}
          score={primaryScore}
          readiness={stripReadiness}
          application={
            selectedApplication
              ? {
                  id: selectedApplication.id,
                  status: normalizeApplicationStatus(selectedApplication.status),
                  jobId: selectedApplication.job_id ?? null,
                  jobTitle: (() => {
                    const job = selectedApplication.jobs
                      ? Array.isArray(selectedApplication.jobs)
                        ? selectedApplication.jobs[0]
                        : selectedApplication.jobs
                      : null;
                    return job?.title ?? null;
                  })(),
                }
              : null
          }
          scheduleHref={
            selectedApplication?.job_id
              ? `/recruit/jobs/${selectedApplication.job_id}/interviews`
              : null
          }
          moveHref={canManageHireability && selectedApplication ? "#tab:profile" : null}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onStatusChange={async () => {
            await Promise.all([refetchApplications(), refetchPipeline()]);
          }}
        />

        {/* In-page section nav — the page is long; give recruiters one-click jumps
            (Ashby/Lever pattern: fast navigation, summary before detail). */}
        <nav
          aria-label="Candidate sections"
          className="sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)]/60 bg-[var(--bg)] px-2 py-1.5 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.8)]"
        >
          {(
            [
              { key: "evidence", label: "Evidence" },
              { key: "profile", label: "Profile" },
              // The approved design's words. "Activity" and "Notes" undersold
              // what these hold: every message sent to the candidate, and the
              // assessment record a hiring decision gets defended with.
              { key: "activity", label: "Comms log" },
              { key: "notes", label: "Notes & assessment" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                window.history.replaceState(
                  null,
                  "",
                  `${window.location.pathname}?${patchWorkspaceQuery(searchParams.toString(), { tab: tab.key })}`,
                );
              }}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${
                activeTab === tab.key
                  ? "bg-[var(--accent)] font-semibold text-black"
                  : "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Row 3 · Triage — evidence, askable doubts, and gaps-as-actions.
            Lives inside the Evidence tab so switching tabs replaces the whole
            area below the nav (otherwise it "follows" you onto every tab). */}
        {activeTab === "evidence" ? (
          <CandidateTriageRow
            applicationId={canManageHireability ? (selectedApplication?.id ?? null) : null}
            greens={primaryScore?.greenFlags ?? []}
            ambers={primaryScore?.amberFlags ?? []}
            gaps={canManageHireability ? stripGaps : []}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        ) : null}

        {/* Two-column shell (mock: "Candidate Profile Redesign"): left = the read
            (scores → activity → notes), right rail = the workspace (application/
            hireability + signal sources). Rail is sticky on large screens. */}
        <div>
          <div className="min-w-0 space-y-6">
            {/* Profile: Snapshot + Resume share a row so the tab fills the width. */}
            <div
              className={`grid gap-6 lg:grid-cols-2 lg:items-start ${activeTab === "profile" ? "" : "hidden"}`}
            >
              <div className="card-lifted rounded-xl p-5">
                <p className="text-body text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Snapshot
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5 [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div]:gap-2.5 [&>div]:rounded-xl [&>div]:border [&>div]:border-white/[0.06] [&>div]:bg-white/[0.025] [&>div]:px-3 [&>div]:py-2 [&>div]:text-sm [&>div]:text-[var(--text-muted)]">
                  <div>
                    <Building2 size={16} className="shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 truncate">{candidate.currentCompany || "—"}</span>
                  </div>
                  <div>
                    <MapPin size={16} className="shrink-0 text-[var(--accent)]" />
                    {candidate.locationCity || candidate.locationState
                      ? `${candidate.locationCity}${candidate.locationState ? `, ${candidate.locationState}` : ""}`
                      : typeof candidateRaw.location === "string" && candidateRaw.location.trim()
                        ? candidateRaw.location.trim()
                        : "—"}
                  </div>
                  <div>
                    <Briefcase size={16} className="shrink-0 text-[var(--accent)]" />
                    {candidate.seniorityLevel}
                  </div>
                  <div>
                    <Clock size={16} className="shrink-0 text-[var(--accent)]" />
                    {candidate.yearsExperience} yrs exp
                  </div>
                  <div>
                    <IndianRupee size={16} className="shrink-0 text-[var(--accent)]" />
                    <span suppressHydrationWarning>
                      {candidate.salaryMinInferred > 0 || candidate.salaryMaxInferred > 0
                        ? `${formatSalary(candidate.salaryMinInferred)} – ${formatSalary(candidate.salaryMaxInferred)}`
                        : "Not disclosed"}
                    </span>
                  </div>
                  <div>
                    <CheckCircle2
                      size={16}
                      className={`shrink-0 ${screeningFlagClass(screeningFlag)}`}
                    />
                    <span className={`min-w-0 truncate ${screeningFlagClass(screeningFlag)}`}>
                      {screeningFlagLabel(screeningFlag)}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-body mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Skills
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {candidate.skillsVerified.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
                      >
                        <CheckCircle2 size={12} />
                        {skill}
                      </span>
                    ))}
                    {candidate.skillsInferred.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]"
                      >
                        <HelpCircle size={12} />
                        {skill}
                      </span>
                    ))}
                    {candidate.skillsVerified.length === 0 &&
                      candidate.skillsInferred.length === 0 && (
                        <span className="text-body text-xs text-[var(--text-muted)]">
                          No skills data available
                        </span>
                      )}
                  </div>
                </div>
              </div>

              {/* CV versions — one click away (Ashby/Lever pattern). Named for
                  what it holds: a candidate re-sends a CV mid-process and the
                  version you scored is not always the one you are reading. */}
              <div className="card-lifted rounded-xl p-5">
                <p className="text-body text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  CV versions
                </p>
                <div className="mt-3">
                  <CandidateResumeAccess
                    candidateId={params.id}
                    variant="inline"
                    versions={resumesData?.versions ?? []}
                    cvRawText={cvRawText}
                    legacyResumeUrl={legacyResumeUrl}
                  />
                  {(resumesData?.versions?.length ?? 0) === 0 && !cvRawText && !legacyResumeUrl ? (
                    <p className="mt-2 text-xs leading-snug text-[var(--text-subtle)]">
                      No CV on file — request one via WhatsApp from the Logistics tab.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {canManageHireability && (
              <div
                className={`card-lifted rounded-xl p-5 ${activeTab === "profile" ? "" : "hidden"}`}
              >
                <p className="text-body text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Compensation &amp; logistics
                </p>

                {hireabilityOpen && (
                  <div className="mt-4 space-y-4">
                    {applicationsLoading ? (
                      <p className="text-xs text-[var(--text-muted)]">Loading applications...</p>
                    ) : recruiterApplications.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        No applications found for this candidate.
                      </p>
                    ) : (
                      <>
                        {recruiterApplications.length > 1 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-2">
                            <select
                              aria-label="Select application"
                              value={selectedApplicationId}
                              onChange={(event) => {
                                setSelectedApplicationId(event.target.value);
                                const selected = recruiterApplications.find(
                                  (application) => application.id === event.target.value,
                                );
                                window.history.replaceState(
                                  null,
                                  "",
                                  `${window.location.pathname}?${patchWorkspaceQuery(searchParams.toString(), { applicationId: event.target.value, jobId: selected?.job_id })}`,
                                );
                              }}
                              className="rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-2 py-1 text-sm text-[var(--text)]"
                            >
                              {recruiterApplications.map((app) => {
                                const job = app.jobs
                                  ? Array.isArray(app.jobs)
                                    ? app.jobs[0]
                                    : app.jobs
                                  : null;
                                const label = job?.title?.trim() || "Role";
                                return (
                                  <option key={app.id} value={app.id}>
                                    {label} · {formatStatusLabel(app.status)}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}

                        {applicationDetail?.prescreenAnswers &&
                          applicationDetail.prescreenAnswers.length > 0 && (
                            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-3">
                              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                <ListChecks size={14} className="text-[var(--accent)]" />
                                WhatsApp screening
                              </p>
                              {(["apply", "post_shortlist"] as const).map((phase) => {
                                const phaseAnswers = applicationDetail.prescreenAnswers!.filter(
                                  (a) => a.phase === phase,
                                );
                                if (phaseAnswers.length === 0) return null;
                                const phaseLabel = phaseAnswers[0]?.phaseLabel ?? phase;
                                return (
                                  <div key={phase} className="mt-3">
                                    <p className="text-xs font-medium text-[var(--text-muted)]">
                                      {phaseLabel}
                                    </p>
                                    <ul className="mt-2 space-y-2.5 text-sm text-[var(--text)]">
                                      {phaseAnswers.map((s) => (
                                        <li
                                          key={s.questionId}
                                          className="border-b border-[var(--border)]/60 pb-2.5 last:border-0 last:pb-0"
                                        >
                                          <p className="font-medium leading-snug">
                                            {s.questionText}
                                          </p>
                                          <p
                                            className={`mt-1 text-sm font-semibold ${
                                              s.passed ? "text-emerald-300" : "text-rose-300"
                                            }`}
                                          >
                                            {s.answer}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {applicationDetail?.screeningAnswers &&
                          applicationDetail.screeningAnswers.length > 0 && (
                            <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-3">
                              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                <ListChecks size={14} className="text-[var(--accent)]" />
                                Pre-screen (yes / no)
                              </p>
                              <ul className="mt-2 space-y-2.5 text-sm text-[var(--text)]">
                                {applicationDetail.screeningAnswers.map((s) => (
                                  <li
                                    key={s.questionId}
                                    className="border-b border-[var(--border)]/60 pb-2.5 last:border-0 last:pb-0"
                                  >
                                    <p className="font-medium leading-snug">{s.questionText}</p>
                                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                                      <span>
                                        Answered:{" "}
                                        <span className="font-semibold text-[var(--text)]">
                                          {s.answerYes ? "Yes" : "No"}
                                        </span>
                                      </span>
                                      <span className="text-[var(--text-muted)]">
                                        {" "}
                                        (knockout rule:{" "}
                                        {s.failOnYes ? "fails on Yes" : "fails on No"})
                                      </span>
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">Current stage:</span>
                            <span className="text-xs font-medium text-[var(--text)]">
                              {selectedPipelineCandidate?.stageName ?? "Not set"}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                              value={targetStageId}
                              onChange={(event) => setTargetStageId(event.target.value)}
                              disabled={
                                stageOptionsLoading || stageMoveSaving || stageOptions.length === 0
                              }
                              className="min-w-[220px] rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)] disabled:opacity-60"
                            >
                              {stageOptions.map((stage) => (
                                <option key={stage.id} value={stage.id}>
                                  {stage.stage_name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={moveStage}
                              disabled={stageOptionsLoading || stageMoveSaving || !targetStageId}
                              className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
                            >
                              {stageOptionsLoading
                                ? "Loading stages..."
                                : stageMoveSaving
                                  ? "Moving..."
                                  : "Move stage"}
                            </button>
                          </div>
                          {stageMoveNotice && (
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                              {stageMoveNotice}
                            </p>
                          )}
                          {FF_INTERVIEW_ROUND_LADDER &&
                            selectedApplication?.job_id &&
                            (ladderLoading || ladderStages.length > 0) && (
                              <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                    Round timeline
                                  </p>
                                  {ladderStages.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => setShowStageTimeline((prev) => !prev)}
                                      className="text-xs font-medium text-[var(--accent)]"
                                    >
                                      {showStageTimeline ? "Hide timeline" : "Show timeline"}
                                    </button>
                                  ) : null}
                                </div>
                                {ladderLoading ? (
                                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                                    Loading rounds…
                                  </p>
                                ) : (
                                  <>
                                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                      <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                                        <p className="font-semibold uppercase tracking-wide text-emerald-300">
                                          Current
                                        </p>
                                        <p className="mt-0.5 text-sm text-[var(--text)]">
                                          {selectedPipelineCandidate?.stageName ?? "Not set"}
                                        </p>
                                      </div>
                                      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-2">
                                        <p className="font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                          Next
                                        </p>
                                        <p className="mt-0.5 text-sm text-[var(--text)]">
                                          {nextLadderStage?.stage_name ?? "Final stage"}
                                        </p>
                                      </div>
                                    </div>
                                    {showStageTimeline ? (
                                      <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                                        {ladderStages.map((st, idx) => {
                                          const isCurrent =
                                            st.id === selectedPipelineCandidate?.stage_id;
                                          return (
                                            <li
                                              key={st.id}
                                              className={
                                                isCurrent
                                                  ? "flex flex-col gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-[var(--text)]"
                                                  : "flex flex-col gap-1 rounded-md border border-[var(--border)]/80 bg-[var(--surface)]/30 px-3 py-2 text-sm text-[var(--text-muted)]"
                                              }
                                            >
                                              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                                Round {idx + 1}
                                              </span>
                                              <span className="font-medium text-[var(--text)]">
                                                {st.stage_name}
                                              </span>
                                              <span className="text-xs text-[var(--text-muted)]">
                                                Interviewer: {formatStageInterviewerLabel(st)}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ol>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            )}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          {hasHireabilityData ? (
                            <div className="col-span-full grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {[
                                {
                                  k: "Current CTC",
                                  v: formatHireabilityLpa(selectedApplication?.current_ctc_lpa),
                                },
                                {
                                  k: "Expected CTC",
                                  v: formatHireabilityLpa(selectedApplication?.expected_ctc_lpa),
                                },
                                {
                                  k: "Notice",
                                  v:
                                    selectedApplication?.notice_period_days != null
                                      ? `${selectedApplication.notice_period_days} days`
                                      : "—",
                                },
                                {
                                  k: "Offers",
                                  v: String(selectedApplication?.offers_in_hand ?? "—"),
                                },
                                {
                                  k: "Available",
                                  v: formatHireabilityDate(selectedApplication?.available_from),
                                },
                                {
                                  k: "Relocation",
                                  v: formatHireabilityText(
                                    selectedApplication?.relocation_willingness,
                                  ),
                                },
                              ].map((row) => (
                                <div
                                  key={row.k}
                                  className="rounded-lg border border-[var(--border)]/70 bg-[var(--surface)]/40 px-3 py-2.5"
                                >
                                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                                    {row.k}
                                  </p>
                                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">
                                    {row.v}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : !showHireabilityForm ? (
                            <button
                              type="button"
                              onClick={() => setShowHireabilityForm(true)}
                              className="col-span-full flex items-center justify-between gap-3 rounded-md border border-dashed border-[var(--border-interactive)] bg-[var(--surface)]/30 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                            >
                              <span className="text-sm text-[var(--text-muted)]">
                                No compensation or availability details yet.
                              </span>
                              <span className="text-xs font-medium text-[var(--accent)]">
                                Add compensation details
                              </span>
                            </button>
                          ) : null}
                          {hasHireabilityData || showHireabilityForm ? (
                            <div className="col-span-full flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => setShowHireabilityForm((prev) => !prev)}
                                className="text-xs font-medium text-[var(--accent)]"
                              >
                                {showHireabilityForm ? "Hide details" : "Edit details"}
                              </button>
                            </div>
                          ) : null}
                          {showHireabilityForm ? (
                            <>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Current CTC (LPA)
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  value={hireabilityDraft.currentCtcLpa}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      currentCtcLpa: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Expected CTC (LPA)
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  value={hireabilityDraft.expectedCtcLpa}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      expectedCtcLpa: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Notice period (days)
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={hireabilityDraft.noticePeriodDays}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      noticePeriodDays: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Offers in hand
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={hireabilityDraft.offersInHand}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      offersInHand: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Available from
                                </span>
                                <input
                                  type="date"
                                  value={hireabilityDraft.availableFrom}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      availableFrom: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-[var(--text-muted)]">
                                  Relocation willingness
                                </span>
                                <select
                                  value={hireabilityDraft.relocationWillingness}
                                  onChange={(event) =>
                                    setHireabilityDraft((prev) => ({
                                      ...prev,
                                      relocationWillingness: event.target.value as
                                        | ""
                                        | "yes"
                                        | "no"
                                        | "negotiable",
                                    }))
                                  }
                                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                                >
                                  <option value="">Select</option>
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                  <option value="negotiable">Negotiable</option>
                                </select>
                              </label>
                            </>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                          <p className="text-xs text-[var(--text-muted)]">
                            Application ID:{" "}
                            <span className="font-mono text-[var(--text-muted)]">
                              {selectedApplication
                                ? selectedApplication.id.slice(0, 8)
                                : "application"}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={saveHireability}
                            disabled={hireabilitySaving || !showHireabilityForm}
                            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                          >
                            {hireabilitySaving ? "Saving..." : "Save hireability"}
                          </button>
                        </div>
                      </>
                    )}

                    {hireabilityNotice && (
                      <p className="text-xs text-[var(--text-muted)]">{hireabilityNotice}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {candidate.signalSources.length > 0 && (
              <div className={`mt-6 ${activeTab === "profile" ? "" : "hidden"}`}>
                <p className="text-body mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Signal Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {candidate.signalSources.map((source) => (
                    <span
                      key={source}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
                    >
                      <Radio size={10} />
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-8 lg:order-1">
            <div className={activeTab === "evidence" ? "" : "hidden"}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Evidence
              </h2>
              {fitScores.length > 0 ? (
                <div className="space-y-4">
                  {fitScores.map((score, scoreIndex) => {
                    const pipelineRow = score.jobPostingId
                      ? pipelineByJobId.get(score.jobPostingId)
                      : undefined;
                    const scoreApplication = score.jobPostingId
                      ? applicationByJobId.get(score.jobPostingId)
                      : undefined;
                    const readiness = scoreApplication
                      ? computeReadiness({
                          noticePeriodDays: scoreApplication.notice_period_days,
                          availableFrom: scoreApplication.available_from,
                          relocationWillingness: scoreApplication.relocation_willingness,
                          offersInHand: scoreApplication.offers_in_hand,
                          hasCv: Boolean(
                            (resumesData?.versions?.length ?? 0) > 0 ||
                            cvRawText ||
                            legacyResumeUrl,
                          ),
                          screeningCompleted: screeningFlag === "completed",
                        })
                      : null;
                    const scoreBody = (
                      <div className="space-y-3">
                        {/* The identity header already carries the action bar for the selected
                            application — only repeat it here for OTHER jobs' applications, so a
                            single-job candidate never sees the same actions twice. */}
                        {canManageHireability &&
                        scoreApplication &&
                        scoreApplication.id !== selectedApplication?.id ? (
                          <CandidateVerdictActions
                            applicationId={scoreApplication.id}
                            status={normalizeApplicationStatus(scoreApplication.status)}
                            jobTitle={(() => {
                              const job = scoreApplication.jobs
                                ? Array.isArray(scoreApplication.jobs)
                                  ? scoreApplication.jobs[0]
                                  : scoreApplication.jobs
                                : null;
                              return job?.title ?? null;
                            })()}
                            onStatusChange={async () => {
                              await Promise.all([refetchApplications(), refetchPipeline()]);
                            }}
                          />
                        ) : null}
                        <FitScoreReasoningPanel
                          score={score}
                          readiness={readiness}
                          hideHero={scoreIndex === 0}
                          showSuperAdminDiagnostics={user?.role === "super_admin"}
                          moatReferrer={
                            pipelineRow
                              ? {
                                  referrerName: pipelineRow.referrer_name,
                                  referrerOrgVerified: pipelineRow.referrer_org_verified,
                                  referrerVerifiedOrgName: pipelineRow.referrer_verified_org_name,
                                  parentReferrerName: pipelineRow.parent_referrer_name,
                                }
                              : undefined
                          }
                        />
                        {score.jobPostingId && score.candidateId ? (
                          <FitScoreFeedbackPrompt
                            jobId={score.jobPostingId}
                            candidateId={score.candidateId}
                            fitScoreId={score.id}
                            enabled={Boolean(interviewEligibleJobIds.get(score.jobPostingId))}
                          />
                        ) : null}
                      </div>
                    );
                    // Summary-first: only the newest scorecard renders expanded; older ones
                    // collapse to a one-line summary (job · score · band) so a multi-job
                    // candidate doesn't become an endless scroll.
                    if (scoreIndex === 0) {
                      return <div key={score.id}>{scoreBody}</div>;
                    }
                    return (
                      <details
                        key={score.id}
                        className="rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/30"
                      >
                        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
                          <span className="font-semibold tabular-nums text-amber-300">
                            {Math.round(score.overallScore)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">
                            {score.jobTitle || "Earlier score"}
                          </span>
                          {score.band ? (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                              {score.band}
                            </span>
                          ) : null}
                          <span className="text-xs text-[var(--text-subtle)]">Expand</span>
                        </summary>
                        <div className="border-t border-[var(--border)]/60 p-3">{scoreBody}</div>
                      </details>
                    );
                  })}
                </div>
              ) : scoresError ? (
                // Score-load failure must be distinguishable from "not scored":
                // the pipeline may show a FitScore this page can't fetch.
                <div className="card-lifted border border-red-500/30 bg-red-500/10 p-8 text-center">
                  <p className="text-body text-sm text-red-300">
                    Couldn&apos;t load this candidate&apos;s scores. {scoresError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchScores()}
                    className="mt-2 text-xs font-semibold text-red-200 underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="card-lifted p-8 text-center">
                  <p className="text-body text-sm text-[var(--text-muted)]">
                    No scores have been computed for this candidate yet.
                  </p>
                </div>
              )}
            </div>

            {/* Operational tooling comes AFTER the scores: the page answers "who is this" (identity
            card), then "are they good" (Scores + verdict actions), then "work the candidate". */}
            {canManageHireability ||
            (selectedApplication?.job_id && selectedPipelineCandidate?.id) ? (
              <div className={activeTab === "activity" ? "" : "hidden"}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Comms log
                </h2>

                {canManageHireability && selectedApplicationId && showOfferDraftFlow ? (
                  <div className="mt-6 first:mt-0">
                    <RecruitCandidateOfferDraft
                      applicationId={selectedApplicationId}
                      defaultRoleTitle={(() => {
                        const job = selectedApplication?.jobs
                          ? Array.isArray(selectedApplication.jobs)
                            ? selectedApplication.jobs[0]
                            : selectedApplication.jobs
                          : null;
                        return job?.title?.trim() || "Role";
                      })()}
                    />
                  </div>
                ) : null}

                {canManageHireability && selectedApplicationId ? (
                  <div className="mt-6 first:mt-0">
                    <ApplicationCommunicationsFeed
                      applicationId={selectedApplicationId}
                      enabled={canManageHireability}
                    />
                  </div>
                ) : null}

                {canManageHireability ? (
                  <div className="mt-6 first:mt-0">
                    <CandidateScreeningCard
                      candidateId={params.id}
                      reqId={selectedApplication?.job_id ?? undefined}
                    />
                  </div>
                ) : null}

                {selectedApplication?.job_id && selectedPipelineCandidate?.id ? (
                  <div className="mt-6 first:mt-0">
                    <InterviewNotetakerCard
                      jobId={selectedApplication.job_id}
                      pipelineCandidateId={selectedPipelineCandidate.id}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {params.id && (
              <div className={activeTab === "notes" ? "" : "hidden"}>
                {/* The assessment sits above the notes because it is evidence,
                    and the notes are usually written about it. */}
                {canManageHireability ? (
                  <CandidateAssessmentState applicationId={selectedApplicationId ?? null} />
                ) : null}
                <CandidateNotesSection candidateId={params.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
