"use client";

import { type Dispatch, type SetStateAction } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AGENCY_BULK_UPLOAD_MAX_FILES } from "@/lib/constants/agency-bulk-upload";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import { type AgencyUploadBulkResultRow } from "@/lib/agency/run-reprocess-queue";
import { ChevronLeft, FileText, Loader2, Upload, X } from "../agency-pipeline-icons";

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
};

type JobOption = {
  id: string;
  title: string;
};

export function AgencyPipelineUploadModal(props: {
  uploadOpen: boolean;
  closeUploadModal: () => void;
  uploadWizardStep: 1 | 2;
  setUploadWizardStep: Dispatch<SetStateAction<1 | 2>>;
  uploadClientId: string;
  setUploadClientId: Dispatch<SetStateAction<string>>;
  uploadClients: OrgRow[];
  /** True while `/api/jobs` is loading (step 1 waits before requiring a role). */
  uploadJobsLoading: boolean;
  uploadJobId: string;
  setUploadJobId: Dispatch<SetStateAction<string>>;
  uploadClientJobs: JobOption[];
  uploadName: string;
  setUploadName: Dispatch<SetStateAction<string>>;
  uploadPhone: string;
  setUploadPhone: Dispatch<SetStateAction<string>>;
  uploadEmail: string;
  setUploadEmail: Dispatch<SetStateAction<string>>;
  uploadFiles: File[];
  uploadFile: File | null;
  setUploadFiles: Dispatch<SetStateAction<File[]>>;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  setUploadBulkResults: Dispatch<SetStateAction<AgencyUploadBulkResultRow[] | null>>;
  uploadSubmitting: boolean;
  uploadBatchProgress: {
    batchIndex: number;
    totalBatches: number;
    filesDone: number;
    filesTotal: number;
  } | null;
  uploadError: string | null;
  uploadSuccess: string | null;
  uploadBulkResults: AgencyUploadBulkResultRow[] | null;
  retryingPending: boolean;
  autoScoreAfterUpload: boolean;
  setAutoScoreAfterUpload: Dispatch<SetStateAction<boolean>>;
  onRetryPendingScoring: () => Promise<void>;
  onUploadCandidates: () => Promise<void>;
  setUploadError: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    uploadOpen,
    closeUploadModal,
    uploadWizardStep,
    setUploadWizardStep,
    uploadClientId,
    setUploadClientId,
    uploadClients,
    uploadJobsLoading,
    uploadJobId,
    setUploadJobId,
    uploadClientJobs,
    uploadName,
    setUploadName,
    uploadPhone,
    setUploadPhone,
    uploadEmail,
    setUploadEmail,
    uploadFiles,
    uploadFile,
    setUploadFiles,
    setUploadFile,
    setUploadBulkResults,
    uploadSubmitting,
    uploadBatchProgress,
    uploadError,
    uploadSuccess,
    uploadBulkResults,
    retryingPending,
    autoScoreAfterUpload,
    setAutoScoreAfterUpload,
    onRetryPendingScoring,
    onUploadCandidates,
    setUploadError,
  } = props;

  if (!uploadOpen) return null;

  const selectedClientName = uploadClients.find((c) => c.id === uploadClientId)?.name ?? "-";
  const selectedRoleTitle = uploadJobId
    ? (uploadClientJobs.find((j) => j.id === uploadJobId)?.title ?? uploadJobId.slice(0, 8))
    : null;
  const canRetryPending = Boolean(
    uploadBulkResults?.some(
      (r) => r.candidateId && (r.parsingPending === undefined || r.parsingPending),
    ),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="heading-section text-lg text-[var(--text)]">Upload candidates</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={closeUploadModal}
            className="rounded-lg p-1 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-3 flex gap-2 text-xs font-medium">
          <span
            className={`rounded-full px-2.5 py-1 ${
              uploadWizardStep === 1
                ? "bg-[var(--accent)]/20 text-[var(--text)]"
                : "bg-[var(--surface)] text-white/60"
            }`}
          >
            1 - Client &amp; contact
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              uploadWizardStep === 2
                ? "bg-[var(--accent)]/20 text-[var(--text)]"
                : "bg-[var(--surface)] text-white/60"
            }`}
          >
            2 - Resume file(s)
          </span>
        </div>
        <p className="mt-2 text-body text-sm text-white/60">
          {uploadWizardStep === 1
            ? "Pick the client and target open role, then continue to attach resumes. Nothing uploads until you confirm files in step 2; there you can optionally auto-run CV parsing and FitScore."
            : `Choose PDF or Word files (max ${AGENCY_BULK_UPLOAD_MAX_FILES} per batch). One file uses the email from step 1; multiple files create one profile per resume.`}
        </p>

        <div className="mt-4 space-y-4">
          {uploadWizardStep === 1 ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Client *</label>
                <select
                  value={uploadClientId}
                  onChange={(e) => {
                    setUploadClientId(e.target.value);
                    setUploadJobId("");
                  }}
                  aria-label="Select client"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                >
                  <option value="">Choose a client...</option>
                  {uploadClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.slug ? ` (${client.slug})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {uploadClientId ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">
                    Target role *
                  </label>
                  <select
                    value={uploadJobId}
                    onChange={(e) => setUploadJobId(e.target.value)}
                    disabled={uploadJobsLoading || uploadClientJobs.length === 0}
                    aria-label="Target role"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {uploadJobsLoading
                        ? "Loading roles…"
                        : uploadClientJobs.length === 0
                          ? "No open roles for this client"
                          : "Choose a role…"}
                    </option>
                    {uploadClientJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                  {!uploadJobsLoading && uploadClientJobs.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      This client has no open jobs. Create or open a role before uploading.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Candidate name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={uploadPhone}
                  onChange={(e) => setUploadPhone(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Email (required if you upload one resume in step 2)"
                  value={uploadEmail}
                  onChange={(e) => setUploadEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
                <p className="mt-1 text-xs text-white/60">
                  For multiple files in step 2 (up to {AGENCY_BULK_UPLOAD_MAX_FILES}), contact
                  details are taken from each CV; this email is ignored.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-2 text-xs text-white/60">
                <p>
                  <span className="font-medium text-[var(--text)]">Client: </span>
                  {selectedClientName}
                  {selectedRoleTitle ? (
                    <>
                      {" "}
                      <span className="text-white/60">.</span>{" "}
                      <span className="font-medium text-[var(--text)]">Role: </span>
                      {selectedRoleTitle}
                    </>
                  ) : null}
                </p>
                {(uploadName.trim() || uploadEmail.trim() || uploadPhone.trim()) && (
                  <p className="mt-1">
                    <span className="font-medium text-[var(--text)]">Contact: </span>
                    {[uploadName.trim(), uploadEmail.trim(), uploadPhone.trim()]
                      .filter(Boolean)
                      .join(" . ")}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Resume(s) (PDF or Word) * - up to {AGENCY_BULK_UPLOAD_MAX_FILES} files per batch
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
                        `File(s) too large: ${fileSizes}. Maximum size is 10 MB per file. Please compress the PDF before uploading.`,
                      );
                      setUploadFiles([]);
                      setUploadFile(null);
                      e.target.value = "";
                      return;
                    }
                    setUploadError(null);
                    setUploadFiles(list);
                    setUploadFile(list[0] ?? null);
                    setUploadBulkResults(null);
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
                        (file, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <FileText size={12} />
                            {file.name}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2.5 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={autoScoreAfterUpload}
                  onChange={(e) => setAutoScoreAfterUpload(e.target.checked)}
                  className="mt-0.5 shrink-0 rounded border-[var(--border)]"
                />
                <span>
                  After upload, queue CV parsing and FitScore in the background (recommended). You
                  can close this window while scoring runs. Turn off to only store files; use Score
                  pending or the pipeline banner later.
                </span>
              </label>
            </>
          )}
        </div>

        {uploadSubmitting && uploadBatchProgress && (
          <div
            className="mt-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
              <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
              <span>
                Saving files… batch {uploadBatchProgress.batchIndex} of{" "}
                {uploadBatchProgress.totalBatches} ({uploadBatchProgress.filesDone}/
                {uploadBatchProgress.filesTotal} resumes)
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{
                  width: `${
                    uploadBatchProgress.filesTotal > 0
                      ? (uploadBatchProgress.filesDone / uploadBatchProgress.filesTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-white/60">
              Multiple files upload in batches for faster, steadier progress. Scoring is queued on
              the server when enabled.
            </p>
          </div>
        )}
        {uploadSubmitting && !uploadBatchProgress && (
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--accent)]">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Saving profile…
          </p>
        )}
        {uploadError && <p className="mt-3 text-sm text-red-400">{uploadError}</p>}
        {uploadSuccess && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{uploadSuccess}</p>
        )}

        {uploadBulkResults && uploadBulkResults.length > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Upload results</h4>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
              {uploadBulkResults.map((result, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 text-white/60"
                >
                  <span className="min-w-0 truncate font-medium">{result.fileName}</span>
                  {result.success ? (
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge tone="success" size="sm">
                        Success
                      </StatusBadge>
                      <span>
                        {result.candidateName ?? "-"}
                        {result.parsingPending
                          ? " . saved (parsing pending)"
                          : ` . ${result.jobsScored ?? 0} scored${result.topScore != null ? ` . top ${result.topScore}%` : ""}`}
                        {result.error ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {" "}
                            - {result.error}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge tone="danger" size="sm">
                        Failed
                      </StatusBadge>
                      <span>{result.error ?? "Failed"}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/60">
              {uploadBulkResults.filter((result) => result.success).length} succeeded,{" "}
              {uploadBulkResults.filter((result) => !result.success).length} failed
            </p>
            {canRetryPending && (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={retryingPending}
                  onClick={onRetryPendingScoring}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {retryingPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Scoring...
                    </>
                  ) : (
                    "Score pending profiles"
                  )}
                </button>
                <p className="mt-1 text-xs text-white/60">
                  CVs are saved - scoring reads from storage, no re-upload needed.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {uploadWizardStep === 2 && !uploadBulkResults ? (
            <button
              type="button"
              onClick={() => {
                setUploadWizardStep(1);
                setUploadError(null);
              }}
              className="mr-auto inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-white/60 hover:text-[var(--text)]"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeUploadModal}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]"
          >
            {uploadBulkResults ? "Close" : "Cancel"}
          </button>
          {!uploadBulkResults && uploadWizardStep === 1 && (
            <button
              type="button"
              onClick={() => {
                if (!uploadClientId.trim()) {
                  setUploadError("Choose a client to continue.");
                  return;
                }
                if (uploadJobsLoading) {
                  setUploadError("Still loading open roles — wait a moment.");
                  return;
                }
                if (uploadClientJobs.length === 0) {
                  setUploadError("This client has no open roles to attach candidates to.");
                  return;
                }
                if (!uploadJobId.trim()) {
                  setUploadError("Choose a target role to continue.");
                  return;
                }
                setUploadError(null);
                setUploadWizardStep(2);
              }}
              disabled={
                !uploadClientId.trim() ||
                uploadJobsLoading ||
                uploadClientJobs.length === 0 ||
                !uploadJobId.trim()
              }
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to resumes
            </button>
          )}
          {!uploadBulkResults && uploadWizardStep === 2 && (
            <button
              type="button"
              onClick={onUploadCandidates}
              disabled={
                !uploadClientId ||
                (uploadClientJobs.length > 0 && !uploadJobId.trim()) ||
                (uploadFiles.length === 0 && !uploadFile) ||
                uploadSubmitting
              }
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {uploadFiles.length > 1 ? `Upload ${uploadFiles.length} profiles` : "Upload profile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
