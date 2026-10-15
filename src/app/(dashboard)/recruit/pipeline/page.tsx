"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Briefcase,
  AlertCircle,
  GitPullRequest,
  Download,
  ListTree,
  SlidersHorizontal,
  MoreHorizontal,
  CheckSquare,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PipelineKanbanBoard } from "@/components/dashboard/PipelineKanbanBoard";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  PIPELINE_STATUS_META,
  PipelineCard,
  type PipelineCandidate,
} from "./components/RecruitPipelineCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPipelineStatusTone } from "@/lib/status-tones";
import { REJECT_REASONS } from "@/lib/v2/review-queue";
import {
  OverrideReasonModal,
  type OverrideReason,
} from "@/components/dashboard/OverrideReasonModal";

type ViewMode = "status" | "job";
type FocusMode = "needs-feedback" | "tomorrow-plan" | "strong-matches";
const REPORT_ACTION_BUTTON_CLASS =
  "flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/75 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_NAV_LINK_CLASS =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";

const FILTER_PILL_CLASS =
  "h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";

export default function PipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const allowReferrerMessage =
    user?.role === "recruiter" || user?.role === "leadership" || user?.role === "hiring_manager";
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const selectedJobId = searchParams.get("jobId");
  const [roleFilter, setRoleFilter] = useState<string | null>(() => selectedJobId);
  const [updating, setUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcomeLogging, setOutcomeLogging] = useState<string | null>(null);
  const [outcomeLogged, setOutcomeLogged] = useState<string | null>(null);
  const [interviewRequesting, setInterviewRequesting] = useState<string | null>(null);
  const [interviewSuccess, setInterviewSuccess] = useState<string | null>(null);
  const [schedulingLinkSending, setSchedulingLinkSending] = useState<string | null>(null);
  const [schedulingLinkSuccess, setSchedulingLinkSuccess] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkAction, setBulkAction] = useState<"move" | "reject_with_template" | "tag">("move");
  const [bulkStageId, setBulkStageId] = useState("");
  const [bulkTemplate, setBulkTemplate] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [repairingStages, setRepairingStages] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [optimisticStatusById, setOptimisticStatusById] = useState<Record<string, string>>({});
  const [delayedRejectTimers, setDelayedRejectTimers] = useState<Record<string, number>>({});
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    pcId: string;
    jobId: string;
    candidateName: string;
    fitScore: number;
    action: "promote" | "reject";
    newStatus: string;
  } | null>(null);

  useEffect(() => {
    setRoleFilter(selectedJobId);
  }, [selectedJobId]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export?type=pipeline");
      if (!res.ok) {
        const message =
          res.status === 429
            ? "Too many exports right now. Please try again in a moment."
            : "Couldn't export the pipeline. Please try again.";
        toast({ title: "Export failed", description: message, tone: "danger" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const { data, loading, error, refetch } = useApiQuery<{
    pipeline: PipelineCandidate[];
    stageCatalog?: Array<{ id: string; job_id: string; stage_name: string; stage_order: number }>;
  }>("/api/my-pipeline");

  const pipeline = useMemo(() => {
    const base = data?.pipeline ?? [];
    return base.map((pc) =>
      optimisticStatusById[pc.id] ? { ...pc, status: optimisticStatusById[pc.id] } : pc,
    );
  }, [data?.pipeline, optimisticStatusById]);
  const requestedFocus = searchParams.get("focus");
  const focusMode: FocusMode | null =
    requestedFocus === "needs-feedback" ||
    requestedFocus === "tomorrow-plan" ||
    requestedFocus === "strong-matches"
      ? requestedFocus
      : null;
  const now = Date.now();
  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const requiresFeedback = useCallback(
    (pc: PipelineCandidate) => {
      if (!pc.interview_scheduled_at || pc.interview_outcome) return false;
      return new Date(pc.interview_scheduled_at).getTime() < now;
    },
    [now],
  );

  const isTomorrowInterview = useCallback(
    (pc: PipelineCandidate) => {
      if (!pc.interview_scheduled_at) return false;
      const time = new Date(pc.interview_scheduled_at).getTime();
      return time >= tomorrowStart.getTime() && time < tomorrowEnd.getTime();
    },
    [tomorrowStart, tomorrowEnd],
  );

  const logOutcomeToFeedback = useCallback(
    async (jobId: string, candidateId: string, outcome: "hired" | "rejected", pcId: string) => {
      try {
        const res = await fetch("/api/feedback/hire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, candidateId, outcome }),
          credentials: "include",
        });
        if (res.ok) {
          setOutcomeLogged(pcId);
          setTimeout(() => setOutcomeLogged(null), 2500);
        }
      } catch {
        // Silent; feedback is best-effort
      }
    },
    [],
  );

  const handleOutcomeLog = useCallback(
    async (jobId: string, candidateId: string, outcome: "hired" | "rejected", pcId: string) => {
      setOutcomeLogging(pcId);
      setActionError(null);
      try {
        const res = await fetch("/api/feedback/hire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, candidateId, outcome }),
          credentials: "include",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setActionError((json as { error?: string }).error ?? "Failed to log outcome");
        } else {
          setOutcomeLogged(pcId);
          setTimeout(() => setOutcomeLogged(null), 2500);
        }
      } catch {
        setActionError("Failed to log outcome");
      }
      setOutcomeLogging(null);
    },
    [],
  );

  const handleRequestInterview = useCallback(
    async (jobId: string, candidateId: string, stageId: string | undefined, pcId: string) => {
      setInterviewRequesting(pcId);
      setActionError(null);
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/request-interview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId,
            ...(stageId && { stageId }),
          }),
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError((json as { error?: string }).error ?? "Failed to request interview");
        } else {
          setInterviewSuccess(pcId);
          setTimeout(() => setInterviewSuccess(null), 2500);
          await refetch();
        }
      } catch {
        setActionError("Failed to request interview");
      }
      setInterviewRequesting(null);
    },
    [refetch],
  );

  const handleSendSchedulingLink = useCallback(
    async (jobId: string, pcId: string) => {
      setSchedulingLinkSending(pcId);
      setActionError(null);
      try {
        const res = await fetch(
          `/api/jobs/${encodeURIComponent(jobId)}/interviews/self-schedule-link`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pipeline_candidate_id: pcId, sendEmail: true }),
            credentials: "include",
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          emailSent?: boolean;
          emailError?: string;
          url?: string;
          data?: { emailSent?: boolean; emailError?: string; url?: string };
        };
        const payload = json.data ?? json;
        if (!res.ok) {
          setActionError(json.error ?? "Could not send scheduling link");
          return;
        }
        if (payload.emailSent === false) {
          setActionError(
            payload.emailError ??
              "Link was created but email was not sent. Add the candidate email or copy the link from Scheduling.",
          );
          return;
        }
        setSchedulingLinkSuccess(pcId);
        toast({
          title: "Scheduling link sent",
          description: "The candidate received an email to pick an interview time.",
        });
        setTimeout(() => setSchedulingLinkSuccess(null), 2500);
      } catch {
        setActionError("Could not send scheduling link");
      } finally {
        setSchedulingLinkSending(null);
      }
    },
    [toast],
  );

  const handleStatusChange = useCallback(
    async (
      pcId: string,
      jobId: string,
      newStatus: string,
      overrideReason?: OverrideReason,
      overrideReasonText?: string,
    ) => {
      const pc = pipeline.find((p) => p.id === pcId);
      const candidateId = pc?.candidate_id;
      const previousStatus = pc?.status ?? null;
      if (!previousStatus || previousStatus === newStatus) return;

      setUpdating(pcId);
      setActionError(null);
      setOptimisticStatusById((prev) => ({ ...prev, [pcId]: newStatus }));
      try {
        const body: {
          status: string;
          override_reason?: OverrideReason;
          override_reason_text?: string;
        } = { status: newStatus };
        if (overrideReason) {
          body.override_reason = overrideReason;
          if (overrideReasonText) {
            body.override_reason_text = overrideReasonText;
          }
        }

        const res = await fetch(`/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setActionError((json as { error?: string }).error ?? "Failed to update status");
          setOptimisticStatusById((prev) => ({ ...prev, [pcId]: previousStatus }));
          toast({
            title: "Couldn't move candidate",
            description: (json as { error?: string }).error ?? "Status update failed.",
            tone: "error",
          });
        } else {
          await refetch();
          setOptimisticStatusById((prev) => {
            const { [pcId]: _, ...rest } = prev;
            return rest;
          });
          if (candidateId && (newStatus === "hired" || newStatus === "rejected")) {
            await logOutcomeToFeedback(jobId, candidateId, newStatus as "hired" | "rejected", pcId);
          }
          toast({
            title: "Pipeline updated",
            description: `Moved to ${PIPELINE_STATUS_META[newStatus]?.label ?? newStatus}.`,
            tone: "success",
          });
        }
      } catch {
        setActionError("Failed to update status");
        setOptimisticStatusById((prev) => ({ ...prev, [pcId]: previousStatus }));
        toast({
          title: "Couldn't move candidate",
          description: "Please try again.",
          tone: "error",
        });
      }
      setUpdating(null);
    },
    [refetch, pipeline, logOutcomeToFeedback, toast],
  );

  const handleStatusChangeWithOverride = useCallback(
    (pcId: string, jobId: string, newStatus: string) => {
      const pc = pipeline.find((p) => p.id === pcId);
      if (!pc) return;

      const currentStatus = pc.status;
      const fitScore = pc.overallScore ?? null;
      const candidateName = pc.candidates?.name ?? "Candidate";

      // Check if this is an override scenario
      const isPromoting =
        (newStatus === "in_progress" || newStatus === "hired") && currentStatus !== newStatus;
      const isRejecting = newStatus === "rejected" && currentStatus !== "rejected";

      // Show override modal if:
      // - Promoting a low-scored candidate (< 60)
      // - Rejecting a high-scored candidate (> 70)
      const needsOverride =
        fitScore !== null && ((isPromoting && fitScore < 60) || (isRejecting && fitScore > 70));

      if (needsOverride) {
        setOverrideModal({
          isOpen: true,
          pcId,
          jobId,
          candidateName,
          fitScore,
          action: isPromoting ? "promote" : "reject",
          newStatus,
        });
      } else {
        if (isRejecting) {
          const previousStatus = currentStatus;
          const existingTimer = delayedRejectTimers[pcId];
          if (existingTimer) {
            window.clearTimeout(existingTimer);
          }
          setOptimisticStatusById((prev) => ({ ...prev, [pcId]: "rejected" }));
          const timer = window.setTimeout(() => {
            void handleStatusChange(pcId, jobId, newStatus);
            setDelayedRejectTimers((prev) => {
              const { [pcId]: _, ...rest } = prev;
              return rest;
            });
          }, 5000);
          setDelayedRejectTimers((prev) => ({ ...prev, [pcId]: timer }));
          toast({
            title: "Candidate will be rejected",
            description: "Undo within 5 seconds to keep current stage.",
            tone: "warning",
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => {
                window.clearTimeout(timer);
                setDelayedRejectTimers((prev) => {
                  const { [pcId]: _, ...rest } = prev;
                  return rest;
                });
                setOptimisticStatusById((prev) => ({ ...prev, [pcId]: previousStatus }));
              },
            },
          });
          return;
        }

        handleStatusChange(pcId, jobId, newStatus);
      }
    },
    [pipeline, handleStatusChange, delayedRejectTimers, toast],
  );

  const handleStageMove = useCallback(
    async (jobId: string, pipelineCandidateId: string, stageId: string) => {
      setUpdating(pipelineCandidateId);
      setActionError(null);
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/candidates/${pipelineCandidateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id: stageId }),
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          const msg = json.error ?? "Failed to move candidate stage.";
          setActionError(msg);
          throw new Error(msg);
        }
        await refetch();
        toast({
          title: "Stage updated",
          description: "Candidate moved successfully.",
          tone: "success",
        });
      } finally {
        setUpdating(null);
      }
    },
    [refetch, toast],
  );

  const handleOverrideConfirm = useCallback(
    (reason: OverrideReason, reasonText?: string) => {
      if (!overrideModal) return;
      setOverrideModal(null);
      handleStatusChange(
        overrideModal.pcId,
        overrideModal.jobId,
        overrideModal.newStatus,
        reason,
        reasonText,
      );
    },
    [overrideModal, handleStatusChange],
  );

  const jobTitles = useMemo(() => {
    const titles = new Map<string, string>();
    for (const pc of pipeline) {
      if (!titles.has(pc.job_id)) {
        titles.set(pc.job_id, pc.jobTitle);
      }
    }
    return Array.from(titles.entries()).map(([id, title]) => ({ id, title }));
  }, [pipeline]);

  const filteredPipeline = useMemo(() => {
    let rows = roleFilter ? pipeline.filter((pc) => pc.job_id === roleFilter) : pipeline;
    if (attentionOnly) {
      rows = rows.filter((pc) => pc.sla_health === "amber" || pc.sla_health === "red");
    }
    if (!focusMode) return rows;
    if (focusMode === "needs-feedback") {
      return rows.filter((pc) => requiresFeedback(pc));
    }
    if (focusMode === "strong-matches") {
      return rows.filter((pc) => (pc.overallScore ?? 0) >= 80);
    }
    return rows.filter((pc) => isTomorrowInterview(pc));
  }, [pipeline, roleFilter, focusMode, attentionOnly, requiresFeedback, isTomorrowInterview]);

  const toggleSelected = useCallback((pcId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(pcId);
      else next.delete(pcId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
  }, [clearSelection]);

  const selectedRows = useMemo(
    () => filteredPipeline.filter((row) => selectedIds.has(row.id)),
    [filteredPipeline, selectedIds],
  );
  const selectedJobIds = useMemo(
    () => [...new Set(selectedRows.map((row) => row.job_id))],
    [selectedRows],
  );
  const hasBulkSelection = selectedIds.size > 0;
  const resolvedBulkJobId =
    roleFilter ??
    (selectedJobIds.length === 1
      ? selectedJobIds[0]
      : jobTitles.length === 1
        ? jobTitles[0]?.id
        : undefined);

  const repairStageLinks = useCallback(async () => {
    if (!resolvedBulkJobId) {
      setActionError("Select one job to repair stage links.");
      return;
    }
    setRepairingStages(true);
    setActionError(null);
    setBulkNotice(null);
    try {
      const res = await fetch(`/api/jobs/${resolvedBulkJobId}/pipeline/repair-stage-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setActionError(json.error ?? "Failed to repair stage links.");
        return;
      }
      setBulkNotice(json.message ?? "Stage links repaired.");
      await refetch();
    } catch {
      setActionError("Failed to repair stage links.");
    } finally {
      setRepairingStages(false);
    }
  }, [refetch, resolvedBulkJobId]);

  const applyBulkAction = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    setActionError(null);
    setBulkNotice(null);
    try {
      if (bulkAction === "move") {
        if (!resolvedBulkJobId) {
          setActionError("Select one job before moving candidates to a stage.");
          return;
        }
        if (!bulkStageId) {
          setActionError("Select a stage to move candidates.");
          return;
        }
        const selectedOutsideJob = selectedRows.some((row) => row.job_id !== resolvedBulkJobId);
        if (selectedOutsideJob) {
          setActionError("Selected candidates span multiple jobs. Filter to one job first.");
          return;
        }
        const movableRows = selectedRows.filter(
          (row) => row.job_id === resolvedBulkJobId && row.stage_id !== bulkStageId,
        );
        if (movableRows.length === 0) {
          setActionError("Selected candidates are already in the chosen stage.");
          return;
        }

        const res = await fetch(`/api/jobs/${resolvedBulkJobId}/pipeline/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move_stage",
            candidateIds: movableRows.map((row) => row.id),
            stageId: bulkStageId,
          }),
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError((json as { error?: string }).error ?? "Failed bulk stage move");
        } else {
          const moved = (json as { updated?: number }).updated ?? selectedIds.size;
          setBulkNotice(`Moved ${moved} candidate(s) to selected stage.`);
          clearSelection();
          void refetch();
        }
        return;
      }

      if (bulkAction === "reject_with_template" && !bulkTemplate.trim()) {
        setActionError("Select a rejection reason first.");
        return;
      }

      const payload: Record<string, unknown> = {
        pipelineCandidateIds: [...selectedIds],
        action: bulkAction,
      };
      if (bulkAction === "reject_with_template") payload.template = bulkTemplate;
      if (bulkAction === "tag") payload.tag = bulkTag;
      const res = await fetch("/api/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string }).error ?? "Failed bulk action");
      } else {
        const payload = json as { updated?: number; auditLogged?: boolean };
        setBulkNotice(
          `Updated ${payload.updated ?? selectedIds.size} candidate(s)${
            payload.auditLogged === false ? " (audit log unavailable)" : " and logged audit trail"
          }.`,
        );
        clearSelection();
        void refetch();
      }
    } catch {
      setActionError("Failed bulk action");
    } finally {
      setBulkApplying(false);
    }
  }, [
    selectedIds,
    bulkAction,
    bulkStageId,
    bulkTemplate,
    bulkTag,
    resolvedBulkJobId,
    selectedRows,
    refetch,
    clearSelection,
  ]);

  const needsFeedbackCount = useMemo(
    () => pipeline.filter((pc) => requiresFeedback(pc)).length,
    [pipeline, requiresFeedback],
  );
  const tomorrowInterviewCount = useMemo(
    () => pipeline.filter((pc) => isTomorrowInterview(pc)).length,
    [pipeline, isTomorrowInterview],
  );
  const slaRiskCount = useMemo(
    () => pipeline.filter((pc) => pc.sla_health === "amber" || pc.sla_health === "red").length,
    [pipeline],
  );

  const showAllPipeline = useCallback(() => {
    setAttentionOnly(false);
    setRoleFilter(null);
    router.push("/recruit/pipeline");
  }, [router]);

  const showNeedsAttention = useCallback(() => {
    setAttentionOnly(true);
    router.push("/recruit/pipeline");
  }, [router]);

  const showNeedsFeedback = useCallback(() => {
    setAttentionOnly(false);
    router.push("/recruit/pipeline?focus=needs-feedback");
  }, [router]);

  const showTomorrowPlan = useCallback(() => {
    setAttentionOnly(false);
    router.push("/recruit/pipeline?focus=tomorrow-plan");
  }, [router]);

  const jobGroups = useMemo(() => {
    const groups = new Map<string, { jobTitle: string; candidates: PipelineCandidate[] }>();
    for (const pc of filteredPipeline) {
      const key = pc.job_id;
      if (!groups.has(key)) {
        groups.set(key, { jobTitle: pc.jobTitle, candidates: [] });
      }
      groups.get(key)!.candidates.push(pc);
    }
    return Array.from(groups.entries()).map(([jobId, group]) => ({
      jobId,
      ...group,
      candidates: [...group.candidates].sort((a, b) => {
        const aOrder = a.stageOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.stageOrder ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aStage = a.stageName ?? "";
        const bStage = b.stageName ?? "";
        if (aStage !== bStage) return aStage.localeCompare(bStage);
        return (a.candidates?.name ?? "").localeCompare(b.candidates?.name ?? "");
      }),
    }));
  }, [filteredPipeline]);

  const effectiveStageCatalog = useMemo(() => {
    const catalog = data?.stageCatalog ?? [];
    const catalogForScope =
      roleFilter != null
        ? catalog.filter((stage) => stage.job_id === roleFilter)
        : jobTitles.length === 1
          ? catalog.filter((stage) => stage.job_id === jobTitles[0]?.id)
          : [];

    const deduped = new Map<string, { id: string; stage_name: string; stage_order: number }>();
    for (const stage of catalogForScope) {
      const key = stage.stage_name.trim().toLowerCase();
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing || stage.stage_order < existing.stage_order) {
        deduped.set(key, {
          id: stage.id,
          stage_name: stage.stage_name,
          stage_order: stage.stage_order,
        });
      }
    }

    return Array.from(deduped.values()).sort((a, b) => a.stage_order - b.stage_order);
  }, [data?.stageCatalog, roleFilter, jobTitles]);

  const stageCatalogByJob = useMemo(() => {
    const byJob = new Map<string, Array<{ id: string; stage_name: string; stage_order: number }>>();
    for (const stage of data?.stageCatalog ?? []) {
      if (!stage.job_id) continue;
      const rows = byJob.get(stage.job_id) ?? [];
      rows.push({ id: stage.id, stage_name: stage.stage_name, stage_order: stage.stage_order });
      byJob.set(stage.job_id, rows);
    }
    for (const [jobId, rows] of byJob.entries()) {
      const deduped = new Map<string, { id: string; stage_name: string; stage_order: number }>();
      for (const stage of rows) {
        const key = stage.stage_name.trim().toLowerCase();
        if (!key) continue;
        const existing = deduped.get(key);
        if (!existing || stage.stage_order < existing.stage_order) {
          deduped.set(key, stage);
        }
      }
      byJob.set(
        jobId,
        Array.from(deduped.values()).sort((a, b) => a.stage_order - b.stage_order),
      );
    }
    return byJob;
  }, [data?.stageCatalog]);

  return (
    <>
      {/* Selection-mode toggle lives in the bulk-actions toolbar below; the
          duplicate header action was removed (Pipeline #3). */}
      <PageHeader
        title="Pipeline"
        subtitle={`${filteredPipeline.length} candidate${filteredPipeline.length !== 1 ? "s" : ""} — move stages, log outcomes, or open a job for interviews and hiring setup`}
      />
      <section className="relative !z-[80] mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Focus</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={showAllPipeline}
                className={`${FILTER_PILL_CLASS} ${
                  !focusMode && !attentionOnly
                    ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] bg-white/[0.02] text-white/60 hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                All candidates
              </button>
              <button
                type="button"
                onClick={showNeedsAttention}
                className={`${FILTER_PILL_CLASS} ${
                  attentionOnly
                    ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                    : "border-[var(--border)] bg-white/[0.02] text-white/60 hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                SLA risk <span className="tabular-nums">({slaRiskCount})</span>
              </button>
              <button
                type="button"
                onClick={showNeedsFeedback}
                className={`${FILTER_PILL_CLASS} ${
                  focusMode === "needs-feedback"
                    ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
                    : "border-[var(--border)] bg-white/[0.02] text-white/60 hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                Needs feedback <span className="tabular-nums">({needsFeedbackCount})</span>
              </button>
              <button
                type="button"
                onClick={showTomorrowPlan}
                className={`${FILTER_PILL_CLASS} ${
                  focusMode === "tomorrow-plan"
                    ? "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]"
                    : "border-[var(--border)] bg-white/[0.02] text-white/60 hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                Tomorrow <span className="tabular-nums">({tomorrowInterviewCount})</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {jobTitles.length > 1 && (
              <label className="min-w-[12rem] flex-1 sm:flex-none">
                <span className="mb-1 block text-xs font-medium text-white/55">Job</span>
                <select
                  id="pipeline-job-filter"
                  aria-label="Filter by job"
                  value={roleFilter ?? ""}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                  className="h-9 w-full rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/75 focus:outline-none focus:ring-1 focus:ring-white/20"
                >
                  <option value="">All jobs</option>
                  {jobTitles.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div>
              <span className="mb-1 block text-xs font-medium text-white/55">View</span>
              <div className="flex h-9 gap-1 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("status")}
                  className={`rounded-md px-3 text-sm transition ${
                    viewMode === "status"
                      ? "bg-white/[0.08] font-semibold text-white"
                      : "font-medium text-white/55 hover:text-white"
                  }`}
                >
                  Stage
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("job")}
                  className={`rounded-md px-3 text-sm transition ${
                    viewMode === "job"
                      ? "bg-white/[0.08] font-semibold text-white"
                      : "font-medium text-white/55 hover:text-white"
                  }`}
                >
                  Job
                </button>
              </div>
            </div>

            <div className="shrink-0">
              <span className="mb-1 block text-xs font-medium text-white/55">Bulk</span>
              <button
                type="button"
                data-testid="pipeline-selection-mode-toggle"
                onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                aria-pressed={selectionMode}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  selectionMode
                    ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <CheckSquare size={16} className="shrink-0 opacity-70" aria-hidden />
                {selectionMode ? "Done" : "Select"}
              </button>
            </div>

            <details className="group relative shrink-0 !z-[120]">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 [&::-webkit-details-marker]:hidden">
                <MoreHorizontal size={16} className="text-white/50" aria-hidden />
                More tools
              </summary>
              <div className="absolute right-0 top-full !z-[140] w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-2xl">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                    className={`${SECONDARY_NAV_LINK_CLASS} w-full justify-start ${
                      selectionMode
                        ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
                        : ""
                    }`}
                  >
                    <CheckSquare size={16} className="text-white/55" aria-hidden />
                    {selectionMode ? "Done selecting" : "Select candidates"}
                  </button>
                  <Link
                    href="/recruit/jobs"
                    className={`${SECONDARY_NAV_LINK_CLASS} w-full justify-start`}
                    title="Open a job, then use the Stages tab to add or reorder interview stages"
                  >
                    <ListTree size={16} className="text-white/55" aria-hidden />
                    Stages per job
                  </Link>
                  <Link
                    href="/company/settings/pipeline"
                    className={`${SECONDARY_NAV_LINK_CLASS} w-full justify-start`}
                    title="Default stages copied to each new job (company admins can edit)"
                  >
                    <SlidersHorizontal size={16} className="text-white/55" aria-hidden />
                    Pipeline defaults
                  </Link>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    className={`${REPORT_ACTION_BUTTON_CLASS} w-full justify-start`}
                  >
                    {exporting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Export pipeline
                  </button>
                  <button
                    type="button"
                    onClick={repairStageLinks}
                    disabled={repairingStages || !resolvedBulkJobId}
                    className={`${REPORT_ACTION_BUTTON_CLASS} w-full justify-start`}
                    title={
                      resolvedBulkJobId
                        ? "Repair missing/invalid stage links for this job"
                        : "Select one job first"
                    }
                  >
                    {repairingStages ? "Repairing..." : "Repair stage links"}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>
      {actionError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          <AlertCircle size={16} /> {actionError}
        </div>
      )}
      {bulkNotice && (
        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {bulkNotice}
        </div>
      )}
      {selectionMode && !loading && !error && pipeline.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-sm text-[var(--accent)]">
          <span>Selection mode — use checkboxes on cards, then apply bulk actions below.</span>
          <button
            type="button"
            onClick={exitSelectionMode}
            className="rounded-md border border-[var(--accent)]/40 px-3 py-1 text-xs font-semibold transition hover:bg-[var(--accent)]/10"
          >
            Done
          </button>
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex min-w-max gap-4">
            {Array.from({ length: 4 }).map((_, colIdx) => (
              <div
                key={colIdx}
                className="flex h-[70vh] w-[320px] shrink-0 flex-col rounded-xl border border-white/10 bg-white/[0.03]"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton shape="circle" className="h-6 w-6" />
                  </div>
                  <Skeleton className="mt-1 h-3 w-16" />
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {Array.from({ length: colIdx < 2 ? 3 : 2 }).map((_, cardIdx) => (
                    <div key={cardIdx} className="card-lifted space-y-3 p-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-14 rounded-full" />
                        <Skeleton className="h-5 w-12 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12">
          <p className="px-4 text-center text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : pipeline.length === 0 ? (
        <div className="mx-auto max-w-md card-lifted px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10 text-white/45">
            <GitPullRequest className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[var(--text)]">
            No one in the pipeline
          </h2>
          <p className="text-body mt-2 text-sm text-white/65">
            When you shortlist candidates for a job, they land here. Stage names (phone screen,
            onsite, and so on) are set per job or as org pipeline defaults.
          </p>
          <div className="mt-6 flex flex-col items-stretch gap-2 sm:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/recruit/jobs"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <ListTree size={16} className="shrink-0" aria-hidden />
                Open jobs
              </Link>
              <Link
                href="/recruit/candidates"
                className="inline-flex items-center justify-center rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white"
              >
                Browse candidate pool
              </Link>
            </div>
            <Link
              href="/company/settings/pipeline"
              className="inline-flex items-center justify-center gap-1.5 text-sm text-white/65 transition hover:text-white hover:underline"
            >
              <SlidersHorizontal size={16} className="text-white/55" aria-hidden />
              Pipeline defaults
            </Link>
          </div>
        </div>
      ) : viewMode === "status" ? (
        <>
          {hasBulkSelection && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <span className="text-xs font-medium text-white/65">
                Selected: <span className="tabular-nums">{selectedIds.size}</span>
              </span>
              <select
                value={bulkAction}
                onChange={(e) =>
                  setBulkAction(e.target.value as "move" | "reject_with_template" | "tag")
                }
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/75"
              >
                <option value="move">Move stage</option>
                <option value="reject_with_template">Reject with template</option>
                <option value="tag">Tag</option>
              </select>
              {bulkAction === "move" && (
                <select
                  value={bulkStageId}
                  onChange={(e) => setBulkStageId(e.target.value)}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/75"
                >
                  <option value="">Target stage</option>
                  {effectiveStageCatalog.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.stage_name}
                    </option>
                  ))}
                </select>
              )}
              {bulkAction === "reject_with_template" && (
                <select
                  value={bulkTemplate}
                  onChange={(e) => setBulkTemplate(e.target.value)}
                  className="min-w-[220px] rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/80"
                >
                  <option value="">Select a rejection reason…</option>
                  {REJECT_REASONS.map((r) => (
                    <option key={r.id} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
              {bulkAction === "tag" && (
                <input
                  value={bulkTag}
                  onChange={(e) => setBulkTag(e.target.value)}
                  placeholder="Tag"
                  className="min-w-[160px] rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white/80 placeholder:text-white/45"
                />
              )}
              <button
                type="button"
                onClick={applyBulkAction}
                disabled={bulkApplying}
                className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:bg-white/[0.04] disabled:opacity-50"
              >
                {bulkApplying ? "Applying..." : "Apply"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
              >
                Clear
              </button>
            </div>
          )}
          <PipelineKanbanBoard
            candidates={filteredPipeline}
            stageCatalog={effectiveStageCatalog}
            updating={updating}
            outcomeLogging={outcomeLogging}
            outcomeLogged={outcomeLogged}
            interviewRequesting={interviewRequesting}
            interviewSuccess={interviewSuccess}
            schedulingLinkSending={schedulingLinkSending}
            schedulingLinkSuccess={schedulingLinkSuccess}
            allowReferrerMessage={allowReferrerMessage}
            onStatusChange={handleStatusChangeWithOverride}
            onMoveStage={handleStageMove}
            onOutcomeLog={handleOutcomeLog}
            onRequestInterview={handleRequestInterview}
            onSendSchedulingLink={handleSendSchedulingLink}
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            onToggleSelect={toggleSelected}
          />
          {!roleFilter && jobTitles.length > 1 && (
            <p className="mt-2 text-xs text-white/50">
              Select a single job to see exact stage columns for that job. All-jobs view can mix
              candidates from different stage setups.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-6">
          {jobGroups.map((group) => (
            <div key={group.jobId} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Briefcase
                    size={16}
                    className="rounded-md bg-white/[0.04] p-0.5 text-white/55 ring-1 ring-inset ring-white/[0.06]"
                  />
                  <h3 className="heading-card text-sm text-[var(--text)]">{group.jobTitle}</h3>
                </div>
                <span className="tabular-nums flex h-6 min-w-6 items-center justify-center rounded-full bg-white/[0.04] px-1.5 text-xs font-semibold text-white/65 ring-1 ring-inset ring-white/[0.06]">
                  {group.candidates.length}
                </span>
              </div>
              <div className="p-4">
                <PipelineKanbanBoard
                  candidates={group.candidates}
                  stageCatalog={stageCatalogByJob.get(group.jobId) ?? []}
                  updating={updating}
                  outcomeLogging={outcomeLogging}
                  outcomeLogged={outcomeLogged}
                  interviewRequesting={interviewRequesting}
                  interviewSuccess={interviewSuccess}
                  schedulingLinkSending={schedulingLinkSending}
                  schedulingLinkSuccess={schedulingLinkSuccess}
                  allowReferrerMessage={allowReferrerMessage}
                  onStatusChange={handleStatusChangeWithOverride}
                  onMoveStage={handleStageMove}
                  onOutcomeLog={handleOutcomeLog}
                  onRequestInterview={handleRequestInterview}
                  onSendSchedulingLink={handleSendSchedulingLink}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  onToggleSelect={toggleSelected}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {overrideModal && (
        <OverrideReasonModal
          isOpen={overrideModal.isOpen}
          onClose={() => setOverrideModal(null)}
          onConfirm={handleOverrideConfirm}
          candidateName={overrideModal.candidateName}
          fitScore={overrideModal.fitScore}
          action={overrideModal.action}
          loading={updating === overrideModal.pcId}
        />
      )}
    </>
  );
}
