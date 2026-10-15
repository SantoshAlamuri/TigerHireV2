"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, Pencil, XCircle, Copy, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import {
  RequisitionThreadBanner,
  hiringRequestFromJobRow,
} from "@/components/dashboard/RequisitionThreadBanner";
import { RecruitJobSubNav } from "./components/RecruitJobSubNav";
import { ShareJobButton } from "@/components/dashboard/ShareJobButton";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { jobsBasePath } from "@/lib/navigation/job-workspace-paths";

export default function RecruitJobWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  /**
   * The workspace root renders the redesigned job page, which carries its own
   * header, pipeline strip and actions. Wrapping it in this shell as well put
   * the new page inside the old chrome — it read as "the redesign did not
   * ship". The deep sub-pages (edit, screening, pipeline-stages, applications,
   * approvals, assessments) still need this shell: RecruitJobSubNav below is
   * the only navigation between them.
   */
  const isWorkspaceRoot = pathname === `/recruit/jobs/${id}`;
  // Link target only — server RBAC stays the gate (Jobs #10).
  const allJobsHref = jobsBasePath(user?.role);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreOpen]);

  async function handleCopyJob() {
    if (!id) return;
    setCopyError(null);
    setCopying(true);
    try {
      const res = await fetch(`/api/jobs/${id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (res.ok && data.jobId) {
        router.push(`/recruit/jobs/${data.jobId}`);
        return;
      }
      setCopyError(
        res.status === 403
          ? "You don't have permission to copy this job."
          : (data.error ?? "Failed to copy job. Please retry."),
      );
    } catch {
      setCopyError("Network error while copying job. Check connection and retry.");
    } finally {
      setCopying(false);
    }
  }

  const {
    data: jobData,
    loading,
    error,
    refetch: refetchJob,
  } = useApiQuery<{ job: Record<string, unknown>; orgSlug?: string }>(
    id ? `/api/jobs/${id}` : null,
  );

  const jobRaw = jobData?.job;
  const job = jobRaw ? mapDbJobToPosting(jobRaw) : null;
  // Raw lifecycle status (mapped `job` only exposes isActive = open, which can't tell draft
  // from closed). Surface a pill so a closed/draft job isn't mistaken for active.
  const jobStatus = typeof jobRaw?.status === "string" ? (jobRaw.status as string) : null;
  const statusBadge =
    jobStatus === "closed" ? (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-white/70">
        Closed
      </span>
    ) : jobStatus === "draft" ? (
      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        Draft
      </span>
    ) : null;

  async function handleCloseJob() {
    if (!id) return;
    setCloseError(null);
    setClosing(true);
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
        credentials: "include",
      });
      if (res.ok) {
        setShowCloseConfirm(false);
        await refetchJob();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) {
          setCloseError("Your session expired. Please sign in again and retry.");
        } else if (res.status === 403) {
          setCloseError("You don't have permission to close this job.");
        } else {
          setCloseError(data.error ?? "Failed to close job. Please retry.");
        }
      }
    } catch {
      setCloseError("Network error while closing job. Check connection and retry.");
    } finally {
      setClosing(false);
    }
  }

  const shellTitle = loading ? "Loading…" : (job?.titleNormalised ?? "Job workspace");
  const shellSubtitle = job?.companyName ?? "";
  const planDocumentEnabled = isPlanDocumentUiEnabled();

  // After every hook, so hook order is identical on both branches.
  if (isWorkspaceRoot) return <>{children}</>;

  return (
    <>
      <PageHeader
        title={shellTitle}
        subtitle={shellSubtitle}
        titleBadge={statusBadge}
        actions={
          id ? (
            <div className="flex flex-wrap items-center gap-2">
              {job ? (
                <ShareJobButton
                  jobId={id}
                  isActive={job.isActive}
                  orgSlug={jobData?.orgSlug}
                  jobTitle={job.titleNormalised}
                  companyName={job.companyName}
                />
              ) : null}
              <Link
                href={`/recruit/jobs/${id}/edit`}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
              >
                <Pencil size={16} />
                Edit JD
              </Link>
              <div ref={moreMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label="More job actions"
                  onClick={() => setMoreOpen((o) => !o)}
                  className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  {copying ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <MoreHorizontal size={16} />
                  )}
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-xl"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        void handleCopyJob();
                      }}
                      disabled={copying}
                      title="Create a new draft job copying this role's setup (JD, rubric, pipeline, screening questions)"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-white/[0.06] disabled:opacity-50"
                    >
                      <Copy size={16} className="text-white/55" />
                      Copy job
                    </button>
                    {job?.isActive && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          setCloseError(null);
                          setShowCloseConfirm(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                      >
                        <XCircle size={16} />
                        Close job
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Link
                href={allJobsHref}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
              >
                <ArrowLeft size={16} />
                All jobs
              </Link>
            </div>
          ) : null
        }
      />
      {copyError ? (
        <p
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          role="alert"
        >
          {copyError}
        </p>
      ) : null}
      {showCloseConfirm && id && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="card-lifted mx-4 w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">Close this job?</h3>
            <p className="mt-2 text-sm text-white/65">
              This will mark the job as closed, remove it from external job boards, and preserve all
              applications, fit scores, and pipeline history. Candidates will no longer be able to
              apply.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setCloseError(null);
                }}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseJob}
                disabled={closing}
                className="inline-flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {closing && <Loader2 size={14} className="animate-spin" />}
                Yes, close job
              </button>
            </div>
            {closeError ? <p className="mt-3 text-sm text-red-400">{closeError}</p> : null}
          </div>
        </div>
      )}

      {error && !loading ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button
            type="button"
            onClick={() => refetchJob()}
            className="ml-3 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && !jobRaw ? (
        <div className="card-lifted flex flex-col items-center justify-center py-20">
          <p className="text-body text-white/65">No job posting found for this ID.</p>
          <button
            type="button"
            onClick={() => router.push(allJobsHref)}
            className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Back to Jobs
          </button>
        </div>
      ) : (
        <>
          {id && jobRaw && !planDocumentEnabled ? (
            <RequisitionThreadBanner
              dashboardPrefix="/recruit"
              activeStep="role"
              hiringRequest={hiringRequestFromJobRow(jobRaw)}
              jobId={id}
            />
          ) : null}
          {id && jobRaw ? <RecruitJobSubNav jobId={id} /> : null}
          {children}
        </>
      )}
    </>
  );
}
