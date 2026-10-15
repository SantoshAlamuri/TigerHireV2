"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, GitPullRequest, RefreshCw, Upload, X } from "./agency-pipeline-icons";
import { normalizeEmailForCandidate } from "@/lib/agents/candidate-dedup";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { AGENCY_STAGES, DEFAULT_AGENCY_STAGE } from "@/lib/constants/agency-stages";
import {
  AGENCY_BULK_UPLOAD_MAX_FILES,
  AGENCY_UPLOAD_CLIENT_BATCH_SIZE,
} from "@/lib/constants/agency-bulk-upload";
import {
  runAgencyReprocessQueue,
  applyJobScopedScoresToOptimisticMap,
  type AgencyUploadBulkResultRow,
} from "@/lib/agency/run-reprocess-queue";
import { requestAgencyEnqueueScoring } from "@/lib/agency/enqueue-scoring-client";
import { KanbanColumn, type PipelineEntry } from "./components/AgencyPipelineKanban";
import { AgencyPipelineControls } from "./components/AgencyPipelineControls";
import { AgencyPipelineUploadModal } from "./components/AgencyPipelineUploadModal";

interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
}

function chunkFiles<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** This job row already has a FitScore (API or optimistic Kanban override). */
function agencyPipelineRowHasFitScore(
  entry: PipelineEntry,
  optimisticByPcId: Record<string, number>,
): boolean {
  if (optimisticByPcId[entry.id] !== undefined) return true;
  return entry.overallScore != null;
}

/**
 * Candidates to include in “not scored” / Score All: still marked parsing pending but at least one
 * pipeline row has no score yet. Avoids stale `processing_status` after successful scoring.
 */
function agencyCandidatesNeedingPipelineScoring(
  entries: PipelineEntry[],
  optimisticByPcId: Record<string, number>,
): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.candidates?.processing_status !== "pending") continue;
    if (agencyPipelineRowHasFitScore(e, optimisticByPcId)) continue;
    ids.add(e.candidate_id);
  }
  return [...ids];
}

/**
 * Order cards within a stage column: highest Fit first (top → bottom), unscored last,
 * then name A→Z as a stable tie-break.
 */
function sortAgencyPipelineEntriesInColumn(
  entries: PipelineEntry[],
  optimisticByPcId: Record<string, number>,
): PipelineEntry[] {
  return [...entries].sort((a, b) => {
    const scoreA = optimisticByPcId[a.id] ?? a.overallScore ?? -1;
    const scoreB = optimisticByPcId[b.id] ?? b.overallScore ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const nameA = a.candidates?.name ?? "";
    const nameB = b.candidates?.name ?? "";
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}

export default function AgencyPipelinePage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoringAll, setScoringAll] = useState(false);
  const [scoreProgress, setScoreProgress] = useState<{
    done: number;
    total: number;
    current: string | null;
  } | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClientId, setUploadClientId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadJobId, setUploadJobId] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadEmail, setUploadEmail] = useState("");
  const [uploadPhone, setUploadPhone] = useState("");
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [retryingPending, setRetryingPending] = useState(false);
  const [optimisticScoreByEntryId, setOptimisticScoreByEntryId] = useState<Record<string, number>>(
    {},
  );
  const [selectedPcIds, setSelectedPcIds] = useState<Set<string>>(new Set());
  const [bulkAgencyStage, setBulkAgencyStage] = useState<string>("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [erasingCandidateId, setErasingCandidateId] = useState<string | null>(null);
  const [pipelineActionError, setPipelineActionError] = useState<string | null>(null);
  const [uploadWizardStep, setUploadWizardStep] = useState<1 | 2>(1);
  const [uploadBulkResults, setUploadBulkResults] = useState<AgencyUploadBulkResultRow[] | null>(
    null,
  );
  const [autoScoreAfterUpload, setAutoScoreAfterUpload] = useState(true);
  const [uploadBatchProgress, setUploadBatchProgress] = useState<{
    batchIndex: number;
    totalBatches: number;
    filesDone: number;
    filesTotal: number;
  } | null>(null);
  const appliedUploadPrefillRef = useRef<string | null>(null);
  const lastPipelineRefetchAt = useRef<number>(0);
  const VISIBILITY_PIPELINE_REFETCH_MS = 15_000;

  const { data, loading, error, refetch, mergeData } = useApiQuery<{
    pipeline: PipelineEntry[];
  }>("/api/my-pipeline", undefined, { cacheTtlMs: 0 });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastPipelineRefetchAt.current < VISIBILITY_PIPELINE_REFETCH_MS) return;
      lastPipelineRefetchAt.current = now;
      void refetch({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);
  const { data: orgsData } = useApiQuery<{ organisations: OrgRow[] }>(
    uploadOpen ? "/api/organisations" : null,
  );
  const { data: jobsData, loading: uploadJobsLoading } = useApiQuery<{
    jobs: Record<string, unknown>[];
    pagination: { total: number };
  }>(uploadOpen ? "/api/jobs" : null);

  const uploadClients = orgsData?.organisations ?? [];
  const allJobsForUpload = jobsData?.jobs?.map(mapDbJobToPosting) ?? [];
  const uploadClientJobs = uploadClientId
    ? allJobsForUpload.filter((j) => j.companyId === uploadClientId)
    : [];
  const uploadClientJobOptions = uploadClientJobs.map((j) => ({
    id: j.id,
    title: j.titleNormalised ?? j.titleRaw,
  }));

  useEffect(() => {
    const shouldOpenUpload = searchParams.get("upload") === "1";
    const prefillJobId = searchParams.get("jobId") ?? "";
    const prefillKey = `${shouldOpenUpload}:${prefillJobId}`;
    if (!shouldOpenUpload || appliedUploadPrefillRef.current === prefillKey) return;

    setUploadWizardStep(1);
    setUploadOpen(true);

    if (!prefillJobId) {
      appliedUploadPrefillRef.current = prefillKey;
      return;
    }

    const prefillJob = allJobsForUpload.find((job) => job.id === prefillJobId);
    if (!prefillJob) return;

    appliedUploadPrefillRef.current = prefillKey;
    setUploadClientId(prefillJob.companyId);
    setUploadJobId(prefillJob.id);
    setClientFilter(prefillJob.companyId);
    setRoleFilter(prefillJob.id);
  }, [allJobsForUpload, searchParams]);

  const allEntries = data?.pipeline ?? [];

  const clientOrgNames = new Map<string, string>();
  for (const e of allEntries) {
    if (e.jobOrganisationId && !clientOrgNames.has(e.jobOrganisationId)) {
      clientOrgNames.set(
        e.jobOrganisationId,
        e.jobOrganisationName ?? e.jobOrganisationId.slice(0, 8),
      );
    }
  }
  const clientOrgs = [...clientOrgNames.keys()];
  const clientOptions = clientOrgs.map((orgId) => ({
    id: orgId,
    label: clientOrgNames.get(orgId) ?? orgId.slice(0, 8),
  }));

  const jobTitles = useMemo(() => {
    const titles = new Map<string, string>();
    for (const e of allEntries) {
      if (!titles.has(e.job_id)) {
        titles.set(e.job_id, e.jobTitle);
      }
    }
    return Array.from(titles.entries()).map(([id, title]) => ({ id, title }));
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (clientFilter && e.jobOrganisationId !== clientFilter) return false;
      if (roleFilter && e.job_id !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = e.candidates?.name?.toLowerCase() ?? "";
        const job = e.jobTitle.toLowerCase();
        const email = e.candidates?.email?.toLowerCase() ?? "";
        if (!name.includes(q) && !job.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, clientFilter, roleFilter, searchQuery]);

  const entriesByStage = useMemo(() => {
    const map = new Map<string, PipelineEntry[]>();
    for (const stage of AGENCY_STAGES) {
      map.set(stage.key, []);
    }
    for (const entry of filteredEntries) {
      const stageKey = entry.agency_stage ?? DEFAULT_AGENCY_STAGE;
      const bucket = map.get(stageKey);
      if (bucket) {
        bucket.push(entry);
      } else {
        map.get(DEFAULT_AGENCY_STAGE)!.push(entry);
      }
    }
    for (const stage of AGENCY_STAGES) {
      map.set(
        stage.key,
        sortAgencyPipelineEntriesInColumn(map.get(stage.key) ?? [], optimisticScoreByEntryId),
      );
    }
    return map;
  }, [filteredEntries, optimisticScoreByEntryId]);

  const stageCounts = AGENCY_STAGES.map((stage) => ({
    ...stage,
    count: entriesByStage.get(stage.key)?.length ?? 0,
  }));

  async function handleScoreAll() {
    const uniqueIds = agencyCandidatesNeedingPipelineScoring(allEntries, optimisticScoreByEntryId);
    if (uniqueIds.length === 0) return;
    setScoringAll(true);
    setScoreError(null);
    setScoreProgress({ done: 0, total: uniqueIds.length, current: "Queuing…" });

    const nameByCandidateId = new Map(
      allEntries.map((e) => [e.candidate_id, e.candidates?.name ?? null] as const),
    );

    try {
      const { queued } = await requestAgencyEnqueueScoring(uniqueIds);
      if (queued > 0) {
        toast({
          title: "Scoring queued",
          description: `${queued} candidate${queued === 1 ? "" : "s"} will be scored in the background.`,
          tone: "success",
        });
        setScoreProgress(null);
        await refetch({ silent: true });
        return;
      }

      setScoreProgress({ done: 0, total: uniqueIds.length, current: null });
      const queueResults = await runAgencyReprocessQueue(uniqueIds, {
        onProgress: (index, total, candidateId) => {
          if (!candidateId) {
            setReprocessingId(null);
            setScoreProgress({ done: total, total, current: null });
            return;
          }
          setScoreProgress({
            done: index,
            total,
            current: nameByCandidateId.get(candidateId) ?? candidateId.slice(0, 8),
          });
          setReprocessingId(candidateId);
        },
      });

      setReprocessingId(null);
      setOptimisticScoreByEntryId((prev) => {
        let next = { ...prev };
        for (const r of queueResults) {
          if (!r.success) continue;
          next = applyJobScopedScoresToOptimisticMap(
            next,
            allEntries,
            r.candidateId,
            r.jobScores,
            r.score ?? null,
          );
        }
        return next;
      });

      const failed = queueResults.filter((r) => !r.success);
      if (failed.length > 0) {
        const f = failed[0];
        const label = nameByCandidateId.get(f.candidateId) ?? f.candidateId.slice(0, 8);
        const extra = failed.length > 1 ? ` (+${failed.length - 1} more failed)` : "";
        setScoreError(`${label}: ${f.error ?? "failed"}${extra}`);
        toast({
          title: "Some candidates failed scoring",
          description: `${label}: ${f.error ?? "failed"}${extra}`,
          tone: "warning",
        });
      } else {
        toast({
          title: "Scoring complete",
          description: `Processed ${uniqueIds.length} candidate${uniqueIds.length === 1 ? "" : "s"}.`,
          tone: "success",
        });
      }

      await refetch({ silent: true });
      setScoreProgress({
        done: uniqueIds.length,
        total: uniqueIds.length,
        current: null,
      });
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Failed to queue scoring");
    } finally {
      setScoringAll(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch("/api/agency/backfill-pipeline", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        added?: number;
        message?: string;
      };
      if (res.ok && (json.added ?? 0) > 0) void refetch({ silent: true });
    } finally {
      setBackfilling(false);
    }
  }

  async function handleUploadCandidates() {
    if (!uploadClientId) return;
    if (uploadClientJobOptions.length > 0 && !uploadJobId.trim()) {
      setUploadError("Choose a target role before uploading.");
      return;
    }
    const isBulk = uploadFiles.length > 1;
    const filesToUse = isBulk ? uploadFiles : uploadFile ? [uploadFile] : [];
    if (filesToUse.length === 0) return;

    if (!isBulk && !normalizeEmailForCandidate(uploadEmail)) {
      setUploadError(
        "Enter a valid email for single-file upload so we can match returning candidates and avoid duplicates.",
      );
      return;
    }

    setUploadSubmitting(true);
    setUploadError(null);
    setUploadBulkResults(null);

    if (isBulk) {
      const batches = chunkFiles(filesToUse, AGENCY_UPLOAD_CLIENT_BATCH_SIZE);
      const aggregated: AgencyUploadBulkResultRow[] = [];
      let scoringQueuedTotal = 0;
      try {
        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b]!;
          setUploadBatchProgress({
            batchIndex: b + 1,
            totalBatches: batches.length,
            filesDone: aggregated.length,
            filesTotal: filesToUse.length,
          });

          const formData = new FormData();
          formData.append("clientOrgId", uploadClientId);
          if (uploadJobId) formData.append("jobId", uploadJobId);
          if (autoScoreAfterUpload) formData.append("enqueueScoring", "true");
          else formData.append("enqueueScoring", "false");
          for (const file of batch) {
            formData.append("files", file);
          }
          const res = await fetch("/api/agency/upload-profile/bulk", {
            method: "POST",
            body: formData,
            credentials: "include",
          });
          const json = (await res.json().catch(() => ({}))) as {
            results?: AgencyUploadBulkResultRow[];
            summary?: { scoringQueued?: number };
            error?: string;
            detail?: string;
          };
          if (!res.ok) {
            let msg = json.error ?? "Bulk upload failed";
            if (json.detail) msg = `${msg} (${json.detail})`;
            if (res.status === 413) {
              msg =
                "Total upload size too large. Maximum 10 MB per file. Please compress files or upload fewer files at once.";
            } else if (res.status === 504) {
              msg =
                "Upload timed out. Files may be too large or processing took too long. Try smaller files or upload fewer at once.";
            }
            setUploadError(msg);
            setUploadBulkResults(aggregated.length > 0 ? aggregated : null);
            setUploadBatchProgress(null);
            return;
          }
          aggregated.push(...(json.results ?? []));
          scoringQueuedTotal += json.summary?.scoringQueued ?? 0;
          setUploadBatchProgress({
            batchIndex: b + 1,
            totalBatches: batches.length,
            filesDone: aggregated.length,
            filesTotal: filesToUse.length,
          });
        }

        setUploadBatchProgress(null);
        const results = aggregated;
        setUploadBulkResults(results);
        const succeeded = results.filter((r) => r.success).length;
        if (succeeded > 0) {
          setUploadFiles([]);
          setUploadFile(null);
          try {
            await fetch("/api/agency/backfill-pipeline", {
              method: "POST",
              credentials: "include",
            });
          } catch {
            // non-blocking
          }
          await refetch({ silent: true });

          if (scoringQueuedTotal > 0) {
            toast({
              title: "Upload complete",
              description: `${scoringQueuedTotal} profile${scoringQueuedTotal === 1 ? "" : "s"} queued for scoring in the background. You can close this window.`,
              tone: "success",
            });
          }
        }
      } catch {
        setUploadError("Network error");
        setUploadBulkResults(aggregated.length > 0 ? aggregated : null);
      } finally {
        setUploadBatchProgress(null);
        setUploadSubmitting(false);
      }
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile!);
    formData.append("clientOrgId", uploadClientId);
    if (uploadJobId) formData.append("jobId", uploadJobId);
    if (autoScoreAfterUpload) formData.append("enqueueScoring", "true");
    else formData.append("enqueueScoring", "false");
    if (uploadName.trim()) formData.append("name", uploadName.trim());
    formData.append("email", uploadEmail.trim());
    if (uploadPhone.trim()) formData.append("phone", uploadPhone.trim());
    try {
      const res = await fetch("/api/agency/upload-profile", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        message?: string;
        candidateId?: string;
        candidateName?: string | null;
        jobsScored?: number;
        topScore?: number | null;
        parsingPending?: boolean;
        scoringQueued?: number;
      };
      if (!res.ok) {
        let msg = json.error ?? "Upload failed";
        const detail = json.detail ? ` — ${json.detail}` : "";
        // Handle specific error codes
        if (res.status === 413) {
          msg =
            "File too large. Maximum size is 10 MB. Please compress the PDF or use a smaller file.";
        } else if (res.status === 504) {
          msg =
            "Upload timed out. The file may be too large or processing took too long. Try a smaller file.";
        }
        setUploadError(msg + detail);
        setUploadSuccess(null);
        setUploadSubmitting(false);
        return;
      }
      setUploadError(null);
      setUploadSuccess(
        json.message ??
          (json.scoringQueued && json.scoringQueued > 0
            ? "Profile saved. Scoring runs in the background."
            : "Profile saved."),
      );
      setUploadBulkResults(
        json.candidateId
          ? [
              {
                fileName: uploadFile!.name,
                success: true,
                candidateId: json.candidateId,
                candidateName: json.candidateName ?? null,
                jobsScored: json.jobsScored ?? 0,
                topScore: json.topScore ?? null,
                parsingPending: json.parsingPending ?? true,
              },
            ]
          : null,
      );
      setUploadFile(null);
      setUploadFiles([]);
      try {
        await fetch("/api/agency/backfill-pipeline", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // non-blocking
      }
      await refetch({ silent: true });

      if (json.scoringQueued && json.scoringQueued > 0) {
        toast({
          title: "Upload complete",
          description: "Profile queued for scoring in the background. You can close this window.",
          tone: "success",
        });
      }
    } catch {
      setUploadError("Network error");
    } finally {
      setUploadSubmitting(false);
    }
  }

  const closeUploadModal = useCallback(() => {
    setUploadOpen(false);
    setUploadWizardStep(1);
    setUploadFile(null);
    setUploadFiles([]);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadBulkResults(null);
    setUploadBatchProgress(null);
    setRetryingPending(false);
  }, []);

  const openUploadModal = useCallback(() => {
    setUploadWizardStep(1);
    setUploadOpen(true);
  }, []);

  const handleRetryPendingScoring = useCallback(async () => {
    setRetryingPending(true);
    try {
      const pendingIds = (uploadBulkResults ?? [])
        .filter((r) => r.candidateId && (r.parsingPending === undefined || r.parsingPending))
        .map((r) => r.candidateId!);
      if (pendingIds.length === 0) return;

      const { queued } = await requestAgencyEnqueueScoring(pendingIds);
      if (queued > 0) {
        toast({
          title: "Scoring queued",
          description: `${queued} profile${queued === 1 ? "" : "s"} will be scored in the background.`,
          tone: "success",
        });
        await refetch({ silent: true });
        return;
      }

      const qr = await runAgencyReprocessQueue(pendingIds);
      setUploadBulkResults((prev) =>
        prev
          ? prev.map((r) => {
              if (!r.candidateId) return r;
              const retry = qr.find((x) => x.candidateId === r.candidateId);
              if (!retry) return r;
              return retry.success
                ? {
                    ...r,
                    parsingPending: false,
                    candidateName: retry.candidateName ?? r.candidateName,
                    topScore: retry.score ?? null,
                    jobsScored: retry.score != null ? 1 : 0,
                    error: undefined,
                  }
                : { ...r, error: retry.error ?? "Processing failed" };
            })
          : prev,
      );
      await refetch({ silent: true });
    } catch {
      setUploadError("Scoring failed. Click to retry.");
    } finally {
      setRetryingPending(false);
    }
  }, [uploadBulkResults, refetch, toast]);

  const handleMove = useCallback(
    async (pcId: string, jobId: string, newStage: string) => {
      setPipelineActionError(null);
      setMovingId(pcId);
      mergeData((prev) => {
        if (!prev?.pipeline) return prev ?? { pipeline: [] };
        return {
          pipeline: prev.pipeline.map((e) =>
            e.id === pcId ? { ...e, agency_stage: newStage } : e,
          ),
        };
      });
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ agency_stage: newStage }),
        });
        await refetch({ silent: true });
        if (!res.ok) {
          setPipelineActionError("Could not move candidate. The board was refreshed.");
        }
      } finally {
        setMovingId(null);
      }
    },
    [refetch, mergeData],
  );

  const handleDrop = useCallback(
    async (pcId: string, jobId: string) => {
      if (
        !confirm(
          "Drop this candidate? They stay on the board as rejected and the candidate gets email/WhatsApp (if enabled).",
        )
      )
        return;
      setPipelineActionError(null);
      setDroppingId(pcId);
      mergeData((prev) => {
        if (!prev?.pipeline) return prev ?? { pipeline: [] };
        return {
          pipeline: prev.pipeline.map((e) => (e.id === pcId ? { ...e, status: "rejected" } : e)),
        };
      });
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "rejected" }),
        });
        await refetch({ silent: true });
        if (!res.ok) {
          setPipelineActionError("Could not reject candidate. The board was refreshed.");
        }
      } finally {
        setDroppingId(null);
      }
    },
    [refetch, mergeData],
  );

  const handleDelete = useCallback(
    async (pcId: string, jobId: string) => {
      if (
        !confirm(
          "Remove this row from the pipeline? The card disappears. No email or WhatsApp. The application is marked rejected quietly.",
        )
      )
        return;
      setPipelineActionError(null);
      setDeletingId(pcId);
      mergeData((prev) => {
        if (!prev?.pipeline) return prev ?? { pipeline: [] };
        return { pipeline: prev.pipeline.filter((e) => e.id !== pcId) };
      });
      setSelectedPcIds((prev) => {
        const next = new Set(prev);
        next.delete(pcId);
        return next;
      });
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
          method: "DELETE",
          credentials: "include",
        });
        await refetch({ silent: true });
        if (!res.ok) {
          setPipelineActionError("Could not remove candidate. The board was refreshed.");
        }
      } finally {
        setDeletingId(null);
      }
    },
    [refetch, mergeData],
  );

  const handleEraseCandidateData = useCallback(
    async (candidateId: string) => {
      if (
        !confirm(
          "Permanently erase this candidate’s personal data from TigerHire (GDPR-style)? This cannot be undone. Cards for this candidate will be removed from your pipeline view.",
        )
      ) {
        return;
      }
      setPipelineActionError(null);
      setErasingCandidateId(candidateId);
      mergeData((prev) => {
        if (!prev?.pipeline) return prev ?? { pipeline: [] };
        return {
          pipeline: prev.pipeline.filter((e) => e.candidate_id !== candidateId),
        };
      });
      setSelectedPcIds((prev) => {
        const next = new Set(prev);
        for (const e of allEntries) {
          if (e.candidate_id === candidateId) next.delete(e.id);
        }
        return next;
      });
      setOptimisticScoreByEntryId((prev) => {
        const next = { ...prev };
        for (const e of allEntries) {
          if (e.candidate_id === candidateId) delete next[e.id];
        }
        return next;
      });
      try {
        const res = await fetch("/api/agency/candidates/erase-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ candidateId }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          await refetch({ silent: true });
          const msg = json.error ?? `Could not erase candidate data (${res.status})`;
          setPipelineActionError(msg);
          toast({
            title: "Erasure failed",
            description: msg,
            tone: "error",
          });
          return;
        }
        toast({
          title: "Candidate data erased",
          description: json.message ?? "Personal data has been removed per your request.",
          tone: "success",
        });
        await refetch({ silent: true });
      } catch {
        await refetch({ silent: true });
        setPipelineActionError("Network error while erasing candidate data.");
        toast({
          title: "Erasure failed",
          description: "Network error — the board was refreshed.",
          tone: "error",
        });
      } finally {
        setErasingCandidateId(null);
      }
    },
    [allEntries, mergeData, refetch, toast],
  );

  const toggleSelectPc = useCallback((id: string) => {
    setSelectedPcIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedPcIds.has(e.id));

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedPcIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const e of filteredEntries) next.delete(e.id);
      } else {
        for (const e of filteredEntries) next.add(e.id);
      }
      return next;
    });
  }, [filteredEntries, allFilteredSelected]);

  const handleBulkPipelineAction = useCallback(
    async (action: "agency_stage" | "reject" | "delete") => {
      if (selectedPcIds.size === 0) return;
      if (action === "agency_stage" && !bulkAgencyStage) return;

      const byId = new Map(allEntries.map((e) => [e.id, e]));
      const items = Array.from(selectedPcIds)
        .map((id) => byId.get(id))
        .filter((e): e is PipelineEntry => Boolean(e))
        .map((e) => ({ pipelineCandidateId: e.id, jobId: e.job_id }));

      if (items.length === 0) return;

      if (action === "reject") {
        if (
          !confirm(
            `Reject ${items.length} row(s) in place? Cards stay on the board as rejected (no per-row email/WhatsApp).`,
          )
        ) {
          return;
        }
      }

      if (action === "delete") {
        if (
          !confirm(
            `Delete ${items.length} row(s) from the pipeline? Cards are removed. No email or WhatsApp. Applications set to rejected quietly.`,
          )
        ) {
          return;
        }
      }

      setPipelineActionError(null);
      const idSet = new Set(items.map((i) => i.pipelineCandidateId));
      if (action === "agency_stage") {
        mergeData((prev) => {
          if (!prev?.pipeline) return prev ?? { pipeline: [] };
          return {
            pipeline: prev.pipeline.map((e) =>
              idSet.has(e.id) ? { ...e, agency_stage: bulkAgencyStage } : e,
            ),
          };
        });
      } else if (action === "reject") {
        mergeData((prev) => {
          if (!prev?.pipeline) return prev ?? { pipeline: [] };
          return {
            pipeline: prev.pipeline.map((e) =>
              idSet.has(e.id) ? { ...e, status: "rejected" } : e,
            ),
          };
        });
      } else if (action === "delete") {
        mergeData((prev) => {
          if (!prev?.pipeline) return prev ?? { pipeline: [] };
          return { pipeline: prev.pipeline.filter((e) => !idSet.has(e.id)) };
        });
      }

      setBulkActionLoading(true);
      try {
        const res = await fetch("/api/agency/pipeline/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action,
            ...(action === "agency_stage" ? { agency_stage: bulkAgencyStage } : {}),
            items,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          data?: { updated?: number };
        };
        if (!res.ok) {
          await refetch({ silent: true });
          setPipelineActionError(json.error ?? `Bulk action failed (${res.status})`);
          return;
        }
        setSelectedPcIds(new Set());
        setBulkAgencyStage("");
        await refetch({ silent: true });
      } catch {
        await refetch({ silent: true });
        setPipelineActionError("Bulk action network error");
      } finally {
        setBulkActionLoading(false);
      }
    },
    [selectedPcIds, allEntries, bulkAgencyStage, refetch, mergeData],
  );

  const pendingCount = useMemo(
    () => agencyCandidatesNeedingPipelineScoring(allEntries, optimisticScoreByEntryId).length,
    [allEntries, optimisticScoreByEntryId],
  );

  useEffect(() => {
    if (pendingCount <= 0) return;
    const interval = window.setInterval(() => {
      void refetch({ silent: true });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [pendingCount, refetch]);

  async function handleScoreFromStorage(candidateId: string) {
    setReprocessingId(candidateId);
    setScoreError(null);
    try {
      const res = await fetch("/api/agency/reprocess-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ candidateIds: [candidateId] }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const results = (
          json as {
            results?: Array<{
              success: boolean;
              error?: string;
              score?: number | null;
              candidateName?: string | null;
              jobScores?: { jobId: string; score: number | null }[];
            }>;
          }
        ).results;
        const first = results?.[0];
        if (first && !first.success) {
          setScoreError(first.error ?? "Scoring failed");
        } else if (first && first.success) {
          if (first.score != null || (first.jobScores?.length ?? 0) > 0) {
            setOptimisticScoreByEntryId((prev) =>
              applyJobScopedScoresToOptimisticMap(
                prev,
                allEntries,
                candidateId,
                first.jobScores,
                first.score ?? null,
              ),
            );
          }
          await refetch({ silent: true });
        } else {
          await refetch({ silent: true });
        }
      } else {
        setScoreError((json as { error?: string }).error ?? `Scoring failed (${res.status})`);
      }
    } catch (err) {
      setScoreError(
        err instanceof Error ? err.message : "Network error — check if the page timed out",
      );
    } finally {
      setReprocessingId(null);
    }
  }

  const totalCount = filteredEntries.length;
  const uniqueCandidateCount = new Set(filteredEntries.map((e) => e.candidate_id)).size;

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${totalCount} candidate${totalCount !== 1 ? "s" : ""} across your clients`}
      />
      <AgencyPipelineControls
        scoreError={scoreError}
        pipelineActionError={pipelineActionError}
        setPipelineActionError={setPipelineActionError}
        suppressPendingScoringBanner={uploadOpen}
        pendingCount={pendingCount}
        scoreProgress={scoreProgress}
        scoringAll={scoringAll}
        onScoreAll={handleScoreAll}
        totalCount={totalCount}
        stageCounts={stageCounts}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        clientFilter={clientFilter}
        setClientFilter={setClientFilter}
        clientOptions={clientOptions}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        roleOptions={jobTitles}
        onOpenUpload={openUploadModal}
        onBackfill={handleBackfill}
        backfilling={backfilling}
        selectedCount={selectedPcIds.size}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAllFiltered={toggleSelectAllFiltered}
        filteredCount={filteredEntries.length}
        bulkAgencyStage={bulkAgencyStage}
        setBulkAgencyStage={setBulkAgencyStage}
        stageOptions={AGENCY_STAGES}
        bulkActionLoading={bulkActionLoading}
        onBulkAction={handleBulkPipelineAction}
        onClearSelection={() => {
          setSelectedPcIds(new Set());
          setBulkAgencyStage("");
        }}
        uniqueCandidateCount={uniqueCandidateCount}
      />

      <AgencyPipelineUploadModal
        uploadOpen={uploadOpen}
        closeUploadModal={closeUploadModal}
        uploadWizardStep={uploadWizardStep}
        setUploadWizardStep={setUploadWizardStep}
        uploadClientId={uploadClientId}
        setUploadClientId={setUploadClientId}
        uploadClients={uploadClients}
        uploadJobsLoading={uploadJobsLoading}
        uploadJobId={uploadJobId}
        setUploadJobId={setUploadJobId}
        uploadClientJobs={uploadClientJobOptions}
        uploadName={uploadName}
        setUploadName={setUploadName}
        uploadPhone={uploadPhone}
        setUploadPhone={setUploadPhone}
        uploadEmail={uploadEmail}
        setUploadEmail={setUploadEmail}
        uploadFiles={uploadFiles}
        uploadFile={uploadFile}
        setUploadFiles={setUploadFiles}
        setUploadFile={setUploadFile}
        setUploadBulkResults={setUploadBulkResults}
        uploadSubmitting={uploadSubmitting}
        uploadBatchProgress={uploadBatchProgress}
        uploadError={uploadError}
        uploadSuccess={uploadSuccess}
        uploadBulkResults={uploadBulkResults}
        retryingPending={retryingPending}
        autoScoreAfterUpload={autoScoreAfterUpload}
        setAutoScoreAfterUpload={setAutoScoreAfterUpload}
        onRetryPendingScoring={handleRetryPendingScoring}
        onUploadCandidates={handleUploadCandidates}
        setUploadError={setUploadError}
      />

      {/* Kanban board */}
      {loading ? (
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex min-w-max gap-4">
            {Array.from({ length: AGENCY_STAGES.length }).map((_, colIdx) => (
              <div
                key={colIdx}
                className="flex h-[70vh] w-[320px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm"
              >
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton shape="circle" className="h-6 w-6" />
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {Array.from({ length: colIdx < 3 ? 3 : 2 }).map((__, cardIdx) => (
                    <div key={cardIdx} className="card-lifted space-y-3 p-4">
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
      ) : allEntries.length === 0 ? (
        uploadOpen ? (
          <div className="min-h-[50vh]" aria-hidden />
        ) : (
          <div className="mx-auto max-w-lg card-lifted px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10 text-white/45">
              <GitPullRequest size={28} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-[var(--text)]">No candidates yet</h2>
            <p className="text-body mt-2 text-sm text-white/65">
              Upload profiles from Clients or share apply links. The client needs at least one{" "}
              <strong className="text-[var(--text)]">open job</strong> so candidates can be scored
              and added here.
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <Upload size={16} />
                Upload candidates
              </button>
              <button
                type="button"
                onClick={handleBackfill}
                disabled={backfilling}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {backfilling ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {backfilling ? "Syncing…" : "Sync pipeline"}
              </button>
            </div>
            <Link
              href="/agency/clients"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Go to Clients
            </Link>
          </div>
        )
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-h-[70vh] min-w-max gap-4">
            {AGENCY_STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                entries={entriesByStage.get(stage.key) ?? []}
                onMove={handleMove}
                moving={movingId}
                onScore={handleScoreFromStorage}
                reprocessing={reprocessingId}
                onDrop={handleDrop}
                dropping={droppingId}
                onDelete={handleDelete}
                deleting={deletingId}
                onEraseCandidate={handleEraseCandidateData}
                erasingCandidateId={erasingCandidateId}
                onRefetch={async () => {
                  await refetch({ silent: true });
                  setOptimisticScoreByEntryId({});
                }}
                onOptimisticScore={(entryId, score) =>
                  setOptimisticScoreByEntryId((prev) => ({ ...prev, [entryId]: score }))
                }
                optimisticScoreByEntryId={optimisticScoreByEntryId}
                selectedPcIds={selectedPcIds}
                onSelectToggle={toggleSelectPc}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
