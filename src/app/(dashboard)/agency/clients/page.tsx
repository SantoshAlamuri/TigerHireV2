"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Briefcase,
  Users,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  Link2,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import JobCard from "@/components/dashboard/JobCard";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { AGENCY_BULK_UPLOAD_MAX_FILES } from "@/lib/constants/agency-bulk-upload";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import {
  runAgencyReprocessQueue,
  type AgencyUploadBulkResultRow,
} from "@/lib/agency/run-reprocess-queue";
import { requestAgencyEnqueueScoring } from "@/lib/agency/enqueue-scoring-client";

interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  company_plan: string;
  created_at: string;
}

interface PipelineItem {
  id: string;
  job_id: string;
  jobTitle: string;
  jobOrganisationId: string | null;
  stageName: string | null;
  candidates: { id: string; name: string | null; email: string | null } | null;
  created_at: string;
}

export default function AgencyClientsPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addClientSlug, setAddClientSlug] = useState("");
  const [addClientName, setAddClientName] = useState("");
  const [uploadClient, setUploadClient] = useState<OrgRow | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadJobId, setUploadJobId] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadEmail, setUploadEmail] = useState("");
  const [uploadPhone, setUploadPhone] = useState("");
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState<string | null>(null);
  const [retryingPending, setRetryingPending] = useState(false);
  const [autoScoreAfterUpload, setAutoScoreAfterUpload] = useState(true);
  const [bulkResults, setBulkResults] = useState<AgencyUploadBulkResultRow[] | null>(null);

  const {
    data: orgsData,
    loading: oLoading,
    refetch: refetchOrgs,
  } = useApiQuery<{ organisations: OrgRow[] }>("/api/organisations");
  const { data: jobsData, loading: jLoading } = useApiQuery<{
    jobs: Record<string, unknown>[];
    pagination: { total: number };
  }>("/api/jobs");
  const { data: pipelineData, refetch: refetchPipeline } = useApiQuery<{
    pipeline: PipelineItem[];
  }>("/api/my-pipeline");
  const {
    mutate: addClient,
    loading: addClientLoading,
    error: addClientError,
  } = useOptimisticMutation<{ organisation: OrgRow }, { slug: string; name?: string }>(
    "/api/agency/clients",
    { method: "POST" },
  );

  const loading = oLoading || jLoading;
  const clients = orgsData?.organisations ?? [];
  const allJobs = jobsData?.jobs?.map(mapDbJobToPosting) ?? [];
  const pipeline = pipelineData?.pipeline ?? [];

  const handleAddClient = useCallback(async () => {
    const slug = addClientSlug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) return;
    const payload: { slug: string; name?: string } = { slug };
    if (addClientName.trim()) payload.name = addClientName.trim();
    const result = await addClient(payload);
    if (result) {
      setAddClientSlug("");
      setAddClientName("");
      setAddClientOpen(false);
      refetchOrgs();
    }
  }, [addClientSlug, addClientName, addClient, refetchOrgs]);

  const copyShareLink = useCallback((org: OrgRow) => {
    const slug = org.slug || org.id;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/apply/${slug}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopyDone(org.id);
        setTimeout(() => setCopyDone(null), 2000);
      },
      () => {},
    );
  }, []);

  const handleUploadProfile = useCallback(async () => {
    if (!uploadClient) return;
    const isBulk = uploadFiles.length > 1;
    const filesToUse = isBulk ? uploadFiles : uploadFile ? [uploadFile] : [];
    if (filesToUse.length === 0) return;

    setUploadSubmitting(true);
    setUploadError(null);
    setUploadSuccess(null);
    setBulkResults(null);

    if (isBulk) {
      try {
        const formData = new FormData();
        formData.append("clientOrgId", uploadClient.id);
        formData.append("enqueueScoring", autoScoreAfterUpload ? "true" : "false");
        if (uploadJobId) formData.append("jobId", uploadJobId);
        for (const file of filesToUse) {
          formData.append("files", file);
        }
        const res = await fetch("/api/agency/upload-profile/bulk", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as {
          results?: {
            fileName: string;
            success: boolean;
            candidateId?: string;
            candidateName?: string | null;
            jobsScored?: number;
            topScore?: number | null;
            parsingPending?: boolean;
            error?: string;
          }[];
          summary?: { scoringQueued?: number };
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          let msg = json.error ?? "Bulk upload failed";
          if (json.detail) msg = `${msg} (${json.detail})`;
          // Handle specific error codes
          if (res.status === 413) {
            msg =
              "Total upload size too large. Maximum 10 MB per file. Please compress files or upload fewer files at once.";
          } else if (res.status === 504) {
            msg =
              "Upload timed out. Files may be too large or processing took too long. Try smaller files or upload fewer at once.";
          }
          setUploadError(msg);
          setBulkResults(null);
          return;
        }
        const results = json.results ?? [];
        const succeeded = results.filter((r) => r.success).length;
        setBulkResults(results);
        if (succeeded > 0) {
          setUploadFiles([]);
          setUploadFile(null);
          refetchOrgs();
          try {
            await fetch("/api/agency/backfill-pipeline", {
              method: "POST",
              credentials: "include",
            });
            refetchPipeline();
          } catch {
            // non-blocking; user can use "Sync" on Pipeline page
          }

          if (json.summary?.scoringQueued && json.summary.scoringQueued > 0) {
            setUploadSuccess(
              `${json.summary.scoringQueued} profile(s) queued for background scoring. You can close this window.`,
            );
          }
        }
      } catch {
        setUploadError("Network error");
      } finally {
        setUploadSubmitting(false);
      }
      return;
    }

    if (!uploadEmail.trim()) {
      setUploadError(
        "Email is required for single-file upload so we can match returning candidates and avoid duplicates.",
      );
      setUploadSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile!);
    formData.append("clientOrgId", uploadClient.id);
    formData.append("enqueueScoring", autoScoreAfterUpload ? "true" : "false");
    if (uploadJobId) formData.append("jobId", uploadJobId);
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
        return;
      }
      setUploadError(null);
      if (json.scoringQueued != null && json.scoringQueued > 0) {
        setUploadSuccess(
          json.message ??
            "Profile saved. Scoring runs in the background — you can close this window.",
        );
      } else {
        setUploadSuccess(json.message ?? "Profile saved.");
      }
      setBulkResults(
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
      setUploadJobId("");
      setUploadName("");
      setUploadEmail("");
      setUploadPhone("");
      refetchOrgs();
      try {
        await fetch("/api/agency/backfill-pipeline", {
          method: "POST",
          credentials: "include",
        });
        refetchPipeline();
      } catch {
        // non-blocking
      }
    } catch {
      setUploadError("Network error");
    } finally {
      setUploadSubmitting(false);
    }
  }, [
    uploadClient,
    uploadFile,
    uploadFiles,
    uploadJobId,
    uploadName,
    uploadEmail,
    uploadPhone,
    refetchOrgs,
    refetchPipeline,
    autoScoreAfterUpload,
  ]);

  const closeUploadModal = useCallback(() => {
    setUploadClient(null);
    setUploadFile(null);
    setUploadFiles([]);
    setUploadError(null);
    setUploadSuccess(null);
    setBulkResults(null);
    setRetryingPending(false);
  }, []);

  return (
    <>
      <PageHeader
        title="Client Management"
        subtitle="Manage your client portfolio, share apply links, upload profiles, and track candidates"
        actions={
          <button
            type="button"
            onClick={() => setAddClientOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            <Plus size={18} />
            Add Client
          </button>
        }
      />
      {/* Add Client modal */}
      {addClientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-lifted w-full max-w-md p-6 shadow-xl">
            <h3 className="heading-section text-lg text-[var(--text)]">Add client</h3>
            <p className="mt-1 text-body text-sm text-white/60">
              Add a company by slug (used in apply URL: /apply/
              <strong>acme</strong>). The company does not need to be registered on TigerHire; a
              client record will be created if needed.
            </p>
            <input
              type="text"
              placeholder="Slug (e.g. acme)"
              value={addClientSlug}
              onChange={(e) => setAddClientSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
              className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <input
              type="text"
              placeholder="Company name (optional)"
              value={addClientName}
              onChange={(e) => setAddClientName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            {addClientError && <p className="mt-2 text-sm text-red-400">{addClientError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddClientOpen(false);
                  setAddClientSlug("");
                  setAddClientName("");
                }}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddClient}
                disabled={!addClientSlug.trim() || addClientLoading}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addClientLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload profile modal */}
      {uploadClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-lifted max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="heading-section text-lg text-[var(--text)]">
                Upload profile — {uploadClient.name}
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={closeUploadModal}
                className="rounded-lg p-1 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mt-1 text-body text-sm text-white/60">
              Upload one or more resumes (PDF or Word) to score and add candidates to this
              client&apos;s pipeline. Up to {AGENCY_BULK_UPLOAD_MAX_FILES} resumes per bulk batch.
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              You can store files first, then parse and score in one go (checkbox below) or use
              &quot;Score pending&quot; after upload.
            </p>
            <div className="mt-4 space-y-4">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2.5 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={autoScoreAfterUpload}
                  onChange={(e) => setAutoScoreAfterUpload(e.target.checked)}
                  className="mt-0.5 shrink-0 rounded border-[var(--border)]"
                />
                <span>
                  After upload, parse CVs and run FitScore automatically (recommended). Turn off to
                  only store files for now.
                </span>
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Resume(s) (PDF or Word) * — up to {AGENCY_BULK_UPLOAD_MAX_FILES} files per batch
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  aria-label="Upload resume file(s) (PDF or Word)"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length > AGENCY_BULK_UPLOAD_MAX_FILES) {
                      const max = AGENCY_BULK_UPLOAD_MAX_FILES;
                      const batches = Math.ceil(list.length / max);
                      setUploadError(
                        `Limit is ${max} resumes per upload. You selected ${list.length} — split into ${batches} batches of ${max} or fewer.`,
                      );
                      setUploadFiles([]);
                      setUploadFile(null);
                      e.target.value = "";
                      return;
                    }
                    const oversized = list.filter((f) => f.size > MAX_STANDARD_UPLOAD_BYTES);
                    if (oversized.length > 0) {
                      const fileSizes = oversized
                        .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
                        .join(", ");
                      setUploadError(
                        `File(s) too large: ${fileSizes}. Maximum size is 10 MB per file. Please compress the PDF using an online tool like SmallPDF or Adobe Acrobat before uploading.`,
                      );
                      setUploadFiles([]);
                      setUploadFile(null);
                      e.target.value = ""; // Clear input
                      return;
                    }
                    setUploadError(null);
                    setUploadFiles(list);
                    setUploadFile(list[0] ?? null);
                    setBulkResults(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1 file:text-black"
                />
                {(uploadFiles.length > 0 || uploadFile) && (
                  <div className="mt-1.5 space-y-1">
                    {uploadFiles.length > 1 ? (
                      <p className="text-xs font-medium text-white/60">
                        {uploadFiles.length} files selected
                      </p>
                    ) : null}
                    <ul className="max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-white/60">
                      {(uploadFiles.length > 0 ? uploadFiles : uploadFile ? [uploadFile] : []).map(
                        (f, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <FileText size={12} />
                            {f.name}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
              {(() => {
                const orgJobs = allJobs.filter((j) => j.companyId === uploadClient.id);
                if (orgJobs.length > 1) {
                  return (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60">
                        Target role (optional)
                      </label>
                      <select
                        value={uploadJobId}
                        onChange={(e) => setUploadJobId(e.target.value)}
                        aria-label="Target role (optional)"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                      >
                        <option value="">All open roles</option>
                        {orgJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.titleNormalised}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Candidate name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  disabled={uploadFiles.length > 1}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={uploadPhone}
                  onChange={(e) => setUploadPhone(e.target.value)}
                  disabled={uploadFiles.length > 1}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
              </div>
              <input
                type="email"
                placeholder="Email (required for one file)"
                value={uploadEmail}
                onChange={(e) => setUploadEmail(e.target.value)}
                disabled={uploadFiles.length > 1}
                required={uploadFiles.length <= 1}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
              />
              {uploadFiles.length > 1 && (
                <p className="text-xs text-white/60">
                  Contact fields apply only to single-file uploads. Bulk uses one profile per file.
                </p>
              )}
            </div>
            {uploadSubmitting && (
              <p className="mt-2 flex items-center gap-2 text-sm text-[var(--accent)]">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Saving profiles…
              </p>
            )}
            {uploadError && <p className="mt-3 text-sm text-red-400">{uploadError}</p>}
            {uploadSuccess && (
              <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{uploadSuccess}</p>
            )}
            {bulkResults && bulkResults.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">
                  Bulk upload results
                </h4>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                  {bulkResults.map((r, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-white/60"
                    >
                      <span className="min-w-0 truncate font-medium">{r.fileName}</span>
                      {r.success ? (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge tone="success" size="sm">
                            Success
                          </StatusBadge>
                          {r.topScore != null ? (
                            <FitRing score={r.topScore} size={28} showLabel={false} />
                          ) : null}
                          <span>
                            {r.candidateName ?? "—"}
                            {r.parsingPending
                              ? " · saved (parsing pending)"
                              : ` · ${r.jobsScored ?? 0} scored${r.topScore != null ? ` · top ${r.topScore}%` : ""}`}
                            {r.error ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {" "}
                                — {r.error}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge tone="danger" size="sm">
                            Failed
                          </StatusBadge>
                          <span>{r.error ?? "Failed"}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-white/60">
                  {bulkResults.filter((r) => r.success).length} succeeded,{" "}
                  {bulkResults.filter((r) => !r.success).length} failed
                </p>
                {bulkResults.some(
                  (r) => r.candidateId && (r.parsingPending === undefined || r.parsingPending),
                ) && (
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={retryingPending}
                      onClick={async () => {
                        setRetryingPending(true);
                        setUploadError(null);
                        try {
                          const pendingIds = bulkResults
                            .filter(
                              (r) =>
                                r.candidateId &&
                                (r.parsingPending === undefined || r.parsingPending),
                            )
                            .map((r) => r.candidateId!);
                          try {
                            const result = await requestAgencyEnqueueScoring(pendingIds);
                            if (result.queued > 0) {
                              setUploadSuccess(
                                `${result.queued} profile(s) queued for background scoring.`,
                              );
                            }
                            refetchPipeline();
                          } catch {
                            const qr = await runAgencyReprocessQueue(pendingIds);
                            setBulkResults((prev) => {
                              if (!prev) return prev;
                              const byId = new Map(qr.map((r) => [r.candidateId, r]));
                              return prev.map((r) => {
                                if (!r.candidateId) return r;
                                const stillPending =
                                  r.parsingPending === undefined || r.parsingPending;
                                if (!stillPending) return r;
                                const retryRow = byId.get(r.candidateId);
                                if (!retryRow) return r;
                                return retryRow.success
                                  ? {
                                      ...r,
                                      parsingPending: false,
                                      candidateName: retryRow.candidateName ?? r.candidateName,
                                      topScore: retryRow.score ?? null,
                                      jobsScored: retryRow.score != null ? 1 : 0,
                                      error: undefined,
                                    }
                                  : {
                                      ...r,
                                      error: retryRow.error ?? "Processing failed",
                                    };
                              });
                            });
                            refetchPipeline();
                          }
                        } catch {
                          setUploadError("Scoring failed. Click to retry.");
                        } finally {
                          setRetryingPending(false);
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {retryingPending ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Scoring…
                        </>
                      ) : (
                        "Score pending profiles"
                      )}
                    </button>
                    <p className="mt-1 text-xs text-white/60">
                      CVs are saved — scoring reads from storage, no re-upload needed.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeUploadModal}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              >
                {bulkResults ? "Close" : "Cancel"}
              </button>
              {!bulkResults && (
                <button
                  type="button"
                  onClick={handleUploadProfile}
                  disabled={(uploadFiles.length === 0 && !uploadFile) || uploadSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadFiles.length > 1
                    ? `Upload ${uploadFiles.length} profiles`
                    : "Upload profile"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-lifted p-6">
              <div className="flex items-center gap-4">
                <Skeleton shape="circle" className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="card-lifted p-12 text-center">
          <p className="text-body text-sm text-white/60">
            No clients yet. Add your first client to get started.
          </p>
          <button
            type="button"
            onClick={() => setAddClientOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={18} />
            Add Client
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {clients.map((org) => {
            const orgJobs = allJobs.filter((j) => j.companyId === org.id);
            const orgPipeline = pipeline.filter((p) => p.jobOrganisationId === org.id);
            const isExpanded = expandedId === org.id;
            const applySlug = org.slug || org.id;

            return (
              <div key={org.id} className="card-lifted overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : org.id)}
                  className="flex w-full items-center gap-4 p-6 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="heading-card text-lg text-[var(--text)]">{org.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1.5 text-body text-sm text-white/60">
                        <Briefcase size={14} />
                        {orgJobs.length} JDs
                      </span>
                      <span className="flex items-center gap-1.5 text-body text-sm text-white/60">
                        <Users size={14} />
                        <span suppressHydrationWarning>
                          {orgJobs
                            .reduce((sum, j) => sum + j.matchedCandidatesCount, 0)
                            .toLocaleString()}
                        </span>{" "}
                        matched
                      </span>
                      {orgPipeline.length > 0 && (
                        <span className="flex items-center gap-1.5 text-body text-sm text-[var(--accent)]">
                          {orgPipeline.length} in pipeline
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={20} className="shrink-0 text-white/60" />
                  ) : (
                    <ChevronRight size={20} className="shrink-0 text-white/60" />
                  )}
                </button>

                {isExpanded && (
                  <div className="space-y-6 border-t border-[var(--border)] bg-[var(--bg)]/50 p-6">
                    {/* Actions: Share link + Upload profile */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyShareLink(org);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-white/[0.04]"
                      >
                        <Link2 size={16} />
                        {copyDone === org.id ? "Copied!" : "Copy apply link"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/agency/jobs?view=create&clientId=${org.id}`);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                      >
                        <Briefcase size={16} />
                        Post JD
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadClient(org);
                          setUploadFile(null);
                          setUploadFiles([]);
                          setUploadError(null);
                          setBulkResults(null);
                          setUploadJobId("");
                          setUploadName("");
                          setUploadEmail("");
                          setUploadPhone("");
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        <Upload size={16} />
                        Upload profile
                      </button>
                      {applySlug && (
                        <span className="text-body text-xs text-white/60">
                          Link: /apply/{applySlug}
                        </span>
                      )}
                    </div>

                    {/* Pipeline for this client */}
                    {orgPipeline.length > 0 && (
                      <div>
                        <h4 className="heading-section mb-3 text-sm text-[var(--text)]">
                          Candidates in pipeline
                        </h4>
                        <ul className="space-y-2">
                          {orgPipeline.slice(0, 20).map((pc) => (
                            <li
                              key={pc.id}
                              className="flex flex-wrap items-center justify-between gap-2 card-lifted px-4 py-3"
                            >
                              <span className="text-sm font-medium text-[var(--text)]">
                                {(pc.candidates as { name?: string } | null)?.name ?? "Unknown"}
                              </span>
                              <span className="text-body text-xs text-white/60">
                                {pc.jobTitle}
                                {pc.stageName ? ` · ${pc.stageName}` : ""}
                              </span>
                            </li>
                          ))}
                          {orgPipeline.length > 20 && (
                            <li className="text-body text-xs text-white/60">
                              +{orgPipeline.length - 20} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Job postings */}
                    <div>
                      <h4 className="heading-section mb-4 text-sm text-[var(--text)]">
                        Job postings
                      </h4>
                      {orgJobs.length === 0 ? (
                        <div className="flex items-center gap-4">
                          <p className="text-body text-sm text-white/60">
                            No jobs posted for this client.
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/agency/jobs?view=create&clientId=${org.id}`)
                            }
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
                          >
                            <Plus size={14} />
                            Post first JD
                          </button>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {orgJobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              onClick={() => router.push(`/agency/jobs/${job.id}`)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
