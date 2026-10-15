"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, FileText, Loader2, Upload, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  AGENCY_BULK_UPLOAD_MAX_FILES,
  AGENCY_UPLOAD_CLIENT_BATCH_SIZE,
} from "@/lib/constants/agency-bulk-upload";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";
import {
  type AgencyUploadBulkResultRow,
  mergeAgencyReprocessIntoUploadBulkResults,
  runAgencyReprocessQueue,
} from "@/lib/agency/run-reprocess-queue";

const MAX_FILES = AGENCY_BULK_UPLOAD_MAX_FILES;

type JobOption = {
  id: string;
  title: string;
  status?: string;
};

type BatchProgress = {
  batchIndex: number;
  totalBatches: number;
  filesDone: number;
  filesTotal: number;
};

/** Company recruiter bulk-uploads resumes for one of their own org's open jobs. */
export function CompanyBulkUploadModal(props: {
  open: boolean;
  onClose: () => void;
  /** Open jobs for the caller's org (non-open jobs are filtered out). */
  jobs: JobOption[];
  jobsLoading?: boolean;
  initialJobId?: string;
  /** Called after at least one resume saves so the pool can refetch. */
  onUploaded?: () => void;
}) {
  const { open, onClose, jobs, jobsLoading, onUploaded, initialJobId = "" } = props;

  const pendingUploads = useRef<Array<{
    key: string;
    form: FormData;
    entries: Array<{ file: File; index: number }>;
  }> | null>(null);
  const savedResults = useRef(new Map<number, AgencyUploadBulkResultRow>());
  const [uploadStarted, setUploadStarted] = useState(false);
  const [pendingEmailEntries, setPendingEmailEntries] = useState<
    Array<{ index: number; file: File }>
  >([]);
  const [retryEmails, setRetryEmails] = useState<Record<number, string>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [jobId, setJobId] = useState(initialJobId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [autoScore, setAutoScore] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<AgencyUploadBulkResultRow[] | null>(null);
  const [retryingPending, setRetryingPending] = useState(false);
  const [scoringQueuedNote, setScoringQueuedNote] = useState<string | null>(null);

  const openJobs = jobs.filter((j) => !j.status || j.status === "open");
  const selectedRoleTitle = jobId ? (openJobs.find((j) => j.id === jobId)?.title ?? null) : null;
  const canRetryPending = Boolean(
    bulkResults?.some((r) => r.candidateId && (r.parsingPending === undefined || r.parsingPending)),
  );

  const reset = useCallback(() => {
    pendingUploads.current = null;
    savedResults.current.clear();
    setUploadStarted(false);
    setPendingCount(0);
    setPendingEmailEntries([]);
    setRetryEmails({});
    setStep(1);
    setJobId(initialJobId);
    setName("");
    setPhone("");
    setEmail("");
    setFiles([]);
    setAutoScore(true);
    setSubmitting(false);
    setBatchProgress(null);
    setError(null);
    setBulkResults(null);
    setRetryingPending(false);
    setScoringQueuedNote(null);
  }, [initialJobId]);

  const close = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  async function enqueueScoringBackground(candidateIds: string[]): Promise<number> {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return 0;
    const res = await fetch("/api/company/enqueue-scoring", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: unique }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      queued?: number;
    };
    if (!res.ok) {
      throw new Error(json.error ?? `Enqueue failed (${res.status})`);
    }
    return json.queued ?? 0;
  }

  async function scorePending(candidateIds: string[]) {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return;

    const queued = await enqueueScoringBackground(unique);
    if (queued > 0) {
      setScoringQueuedNote(
        `${queued} profile${queued === 1 ? "" : "s"} queued for scoring in the background. Scores will appear in Candidates shortly — you can close this window.`,
      );
      return;
    }

    const queueResults = await runAgencyReprocessQueue(unique, {
      endpoint: "/api/company/reprocess-candidates",
    });
    setBulkResults((prev) =>
      prev ? mergeAgencyReprocessIntoUploadBulkResults(prev, queueResults) : prev,
    );
  }

  async function onUpload() {
    if (!jobId.trim()) {
      setError("Choose a target role to continue.");
      return;
    }
    if (files.length === 0) {
      setError("Attach at least one resume.");
      return;
    }
    if (files.length === 1 && !email.trim()) {
      setError(
        "Email is required when uploading a single resume so we can match returning candidates.",
      );
      return;
    }

    if (
      (pendingUploads.current ?? []).some(
        (pending) =>
          pending.entries.length === 1 &&
          !pending.form.get("email") &&
          !retryEmails[pending.entries[0].index]?.trim(),
      )
    ) {
      setError("Add an email for each remaining resume before retrying.");
      return;
    }
    if (pendingUploads.current)
      pendingUploads.current = pendingUploads.current.map((pending) => {
        if (pending.entries.length !== 1 || pending.form.get("email")) return pending;
        const form = new FormData();
        for (const [key, value] of pending.form.entries()) form.append(key, value);
        form.append("email", retryEmails[pending.entries[0].index].trim());
        return { ...pending, form, key: crypto.randomUUID() };
      });

    setSubmitting(true);
    setUploadStarted(true);
    setError(null);
    setScoringQueuedNote(null);

    try {
      if (!pendingUploads.current) {
        pendingUploads.current = [];
        for (let offset = 0; offset < files.length; ) {
          const size =
            files.length - offset === AGENCY_UPLOAD_CLIENT_BATCH_SIZE + 1
              ? AGENCY_UPLOAD_CLIENT_BATCH_SIZE - 1
              : AGENCY_UPLOAD_CLIENT_BATCH_SIZE;
          const entries = files
            .slice(offset, offset + size)
            .map((file, index) => ({ file, index: offset + index }));
          const form = new FormData();
          form.append("jobId", jobId);
          if (files.length === 1) {
            if (name.trim()) form.append("name", name.trim());
            if (phone.trim()) form.append("phone", phone.trim());
            if (email.trim()) form.append("email", email.trim());
          }
          form.append("enqueueScoring", String(autoScore));
          entries.forEach(({ file }) => form.append("files", file));
          pendingUploads.current.push({ key: crypto.randomUUID(), form, entries });
          offset += entries.length;
        }
      }
      const batches = [...pendingUploads.current];
      const accumulated: AgencyUploadBulkResultRow[] = [];
      let scoringQueuedTotal = 0;
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        setBatchProgress({
          batchIndex: b + 1,
          totalBatches: batches.length,
          filesDone: [...savedResults.current.values()].filter((row) => row.success).length,
          filesTotal: files.length,
        });
        const res = await fetch("/api/company/upload-profile/bulk", {
          method: "POST",
          credentials: "include",
          headers: { "Idempotency-Key": batch.key },
          body: batch.form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: AgencyUploadBulkResultRow[];
          summary?: { scoringQueued?: number };
        };
        if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
        // Uncertain responses keep the original payload/key for a safe retry.
        if (!json.results || json.results.length !== batch.entries.length)
          throw new Error("Upload response incomplete. Retry remaining files.");
        const failedEntries = batch.entries.filter((entry, index) => {
          const result = json.results![index];
          savedResults.current.set(entry.index, result);
          return !result.success;
        });
        pendingUploads.current = pendingUploads.current.filter((pending) => pending !== batch);
        if (failedEntries.length) {
          const form = new FormData();
          for (const [key, value] of batch.form.entries())
            if (key !== "files") form.append(key, value);
          failedEntries.forEach(({ file }) => form.append("files", file));
          pendingUploads.current.push({ key: crypto.randomUUID(), form, entries: failedEntries });
        }
        accumulated.push(...json.results);
        scoringQueuedTotal += json.summary?.scoringQueued ?? 0;
        setBulkResults(
          [...savedResults.current.entries()].sort(([a], [b]) => a - b).map(([, value]) => value),
        );
        if (json.results.some((result) => result.success)) onUploaded?.();
      }

      if (autoScore) {
        if (scoringQueuedTotal > 0) {
          setScoringQueuedNote(
            `${scoringQueuedTotal} profile${scoringQueuedTotal === 1 ? "" : "s"} queued for scoring in the background. Scores will appear in Candidates shortly — you can close this window.`,
          );
        } else {
          const pendingIds = accumulated
            .filter((r) => r.success && r.candidateId)
            .map((r) => r.candidateId!) as string[];
          await scorePending(pendingIds);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPendingEmailEntries(
        (pendingUploads.current ?? [])
          .filter((batch) => batch.entries.length === 1 && !batch.form.get("email"))
          .map((batch) => batch.entries[0]),
      );
      setPendingCount(pendingUploads.current?.length ?? 0);
      setSubmitting(false);
      setBatchProgress(null);
    }
  }

  async function onRetryPending() {
    if (!bulkResults) return;
    setRetryingPending(true);
    try {
      const pendingIds = bulkResults
        .filter((r) => r.candidateId && (r.parsingPending === undefined || r.parsingPending))
        .map((r) => r.candidateId!) as string[];
      await scorePending(pendingIds);
    } finally {
      setRetryingPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload candidates"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="heading-section text-lg text-[var(--text)]">Bulk upload candidates</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="rounded-lg p-1 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-3 flex gap-2 text-xs font-medium">
          <span
            className={`rounded-full px-2.5 py-1 ${
              step === 1
                ? "bg-[var(--accent)]/20 text-[var(--text)]"
                : "bg-[var(--surface)] text-white/60"
            }`}
          >
            1 - Role &amp; contact
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              step === 2
                ? "bg-[var(--accent)]/20 text-[var(--text)]"
                : "bg-[var(--surface)] text-white/60"
            }`}
          >
            2 - Resume file(s)
          </span>
        </div>

        <p className="mt-2 text-body text-sm text-white/60">
          {step === 1
            ? "Pick the target open role, then continue to attach resumes. Nothing uploads until you confirm files in step 2; there you can optionally auto-run CV parsing and FitScore."
            : `Choose PDF or Word files (max ${MAX_FILES} per batch). One file uses the email from step 1; multiple files create one profile per resume. With AI score on, uploads finish quickly and scoring runs in the background.`}
        </p>

        <div className="mt-4 space-y-4">
          {step === 1 ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Target role *
                </label>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  disabled={jobsLoading || openJobs.length === 0}
                  aria-label="Target role"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {jobsLoading
                      ? "Loading roles…"
                      : openJobs.length === 0
                        ? "No open roles — create or open a role first"
                        : "Choose a role…"}
                  </option>
                  {openJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
                {!jobsLoading && openJobs.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    You have no open jobs. Create or open a role before uploading.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Candidate name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Email (required if you upload one resume in step 2)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                />
                <p className="mt-1 text-xs text-white/60">
                  For multiple files in step 2 (up to {MAX_FILES}), contact details are taken from
                  each CV; this email is ignored.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-2 text-xs text-white/60">
                <p>
                  <span className="font-medium text-[var(--text)]">Role: </span>
                  {selectedRoleTitle ?? "-"}
                </p>
                {(name.trim() || email.trim() || phone.trim()) && (
                  <p className="mt-1">
                    <span className="font-medium text-[var(--text)]">Contact: </span>
                    {[name.trim(), email.trim(), phone.trim()].filter(Boolean).join(" . ")}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">
                  Resume(s) (PDF or Word) * - up to {MAX_FILES} files per batch
                </label>
                <input
                  disabled={submitting || uploadStarted}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  aria-label="Upload resume file(s) (PDF or Word)"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length > MAX_FILES) {
                      const batches = Math.ceil(list.length / MAX_FILES);
                      setError(
                        `Limit is ${MAX_FILES} resumes per upload. You selected ${list.length} — split into ${batches} batches of ${MAX_FILES} or fewer.`,
                      );
                      setFiles([]);
                      e.target.value = "";
                      return;
                    }
                    const oversized = list.filter((f) => f.size > MAX_STANDARD_UPLOAD_BYTES);
                    if (oversized.length > 0) {
                      const fileSizes = oversized
                        .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
                        .join(", ");
                      setError(
                        `File(s) too large: ${fileSizes}. Maximum size is 10 MB per file. Please compress the PDF before uploading.`,
                      );
                      setFiles([]);
                      e.target.value = "";
                      return;
                    }
                    setError(null);
                    setFiles(list);
                    pendingUploads.current = null;
                    savedResults.current.clear();
                    setBulkResults(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1 file:text-black"
                />
                {files.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {files.length > 1 ? (
                      <p className="text-xs font-medium text-white/60">
                        {files.length} files selected
                      </p>
                    ) : null}
                    <ul className="max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-white/60">
                      {files.map((file, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <FileText size={12} />
                          {file.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-2.5 text-xs text-white/60">
                <input
                  disabled={submitting || uploadStarted}
                  type="checkbox"
                  checked={autoScore}
                  onChange={(e) => setAutoScore(e.target.checked)}
                  className="mt-0.5 shrink-0 rounded border-[var(--border)]"
                />
                <span>
                  After upload, run CV parsing and FitScore in the background (recommended). You can
                  close this window once uploads finish — scores appear in Candidates shortly. Turn
                  off to only store files; use Score pending later.
                </span>
              </label>
            </>
          )}
        </div>

        {submitting && batchProgress && (
          <div
            className="mt-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
              <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
              <span>
                Saving files… batch {batchProgress.batchIndex} of {batchProgress.totalBatches} (
                {batchProgress.filesDone}/{batchProgress.filesTotal} resumes)
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{
                  width: `${
                    batchProgress.filesTotal > 0
                      ? (batchProgress.filesDone / batchProgress.filesTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
        {submitting && !batchProgress && (
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--accent)]">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Saving…
          </p>
        )}
        {scoringQueuedNote && (
          <p className="mt-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2.5 text-sm text-[var(--accent)]">
            {scoringQueuedNote}
          </p>
        )}
        {pendingEmailEntries.map(({ index, file }) => (
          <label key={index} className="mt-3 block text-sm">
            Email for {file.name}
            <input
              aria-label={`Email for ${file.name}`}
              type="email"
              disabled={submitting}
              value={retryEmails[index] ?? ""}
              onChange={(event) =>
                setRetryEmails((previous) => ({ ...previous, [index]: event.target.value }))
              }
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] p-2"
            />
          </label>
        ))}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {bulkResults && bulkResults.length > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Upload results</h4>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
              {bulkResults.map((result, i) => (
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
                          ? " . saved (scoring pending)"
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
              {bulkResults.filter((r) => r.success).length} succeeded,{" "}
              {bulkResults.filter((r) => !r.success).length} failed
            </p>
            {canRetryPending && (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={retryingPending}
                  onClick={onRetryPending}
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
                  CVs are saved — scoring runs in the background when queued, or use this button to
                  retry locally when background scoring is unavailable.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-end gap-2 bg-[var(--surface)] py-3">
          {step === 2 && !bulkResults && !uploadStarted ? (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              className="mr-auto inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-white/60 hover:text-[var(--text)]"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
          >
            {bulkResults ? "Close" : "Cancel"}
          </button>
          {!bulkResults && step === 1 && (
            <button
              type="button"
              onClick={() => {
                if (!jobId.trim()) {
                  setError(
                    jobsLoading
                      ? "Still loading open roles — wait a moment."
                      : openJobs.length === 0
                        ? "You have no open roles to attach candidates to."
                        : "Choose a target role to continue.",
                  );
                  return;
                }
                setError(null);
                setStep(2);
              }}
              disabled={jobsLoading || openJobs.length === 0 || !jobId.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to resumes
            </button>
          )}
          {bulkResults && pendingCount > 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={onUpload}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Retry remaining files
            </button>
          )}
          {!bulkResults && step === 2 && (
            <button
              type="button"
              onClick={onUpload}
              disabled={files.length === 0 || submitting}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {files.length > 1 ? `Upload ${files.length} profiles` : "Upload profile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
