"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, FileText, GitBranch, Stamp } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

export type RequisitionThreadHiringRequest = {
  id: string;
  req_code?: string | null;
  title?: string | null;
};

export type RequisitionThreadStep = "requisition" | "role" | "pipeline" | "offer";

type DashboardPrefix = "/recruit" | "/company";

const threadLinkClass =
  "inline-flex min-w-0 max-w-full rounded-full no-underline outline-none ring-offset-2 ring-offset-[var(--bg)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35";

function stepShell(active: boolean, done: boolean, children: React.ReactNode) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        active
          ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--text)]"
          : done
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
            : "border-[var(--border)]/60 bg-[var(--bg-elevated)]/40 text-[var(--text-subtle)]"
      }`}
    >
      {children}
    </span>
  );
}

export function RequisitionThreadBanner({
  dashboardPrefix,
  activeStep,
  hiringRequest,
  jobId,
  applicationId,
  compact = false,
  className = "",
}: {
  dashboardPrefix: DashboardPrefix;
  activeStep: RequisitionThreadStep;
  hiringRequest: RequisitionThreadHiringRequest | null | undefined;
  jobId: string | null | undefined;
  applicationId?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const reqLabel = hiringRequest?.req_code?.trim()
    ? hiringRequest.req_code
    : hiringRequest?.title?.trim()
      ? hiringRequest.title.slice(0, 48) + (hiringRequest.title.length > 48 ? "…" : "")
      : hiringRequest
        ? "Requisition"
        : null;

  const requisitionHref =
    hiringRequest?.id == null
      ? null
      : dashboardPrefix === "/company"
        ? `/company/hiring-requests/${hiringRequest.id}`
        : `${dashboardPrefix}/hiring-requests/${hiringRequest.id}`;

  const roleHref =
    jobId == null
      ? null
      : dashboardPrefix === "/company"
        ? `/company/jobs/${jobId}`
        : `/recruit/jobs/${jobId}`;

  const pipelineHref =
    dashboardPrefix === "/company"
      ? user?.role === "leadership"
        ? jobId
          ? `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`
          : "/recruit/pipeline"
        : jobId
          ? `/company/my-pipeline?jobId=${encodeURIComponent(jobId)}`
          : "/company/my-pipeline"
      : jobId
        ? `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`
        : "/recruit/pipeline";

  const offerBase =
    dashboardPrefix === "/company" ? "/company/offers/draft" : "/recruit/offers/draft";
  const offerHref =
    applicationId && applicationId.length > 0
      ? `${offerBase}?applicationId=${encodeURIComponent(applicationId)}`
      : offerBase;
  const isRequisitionStep = activeStep === "requisition";
  const isRoleStep = activeStep === "role";
  const isPipelineStep = activeStep === "pipeline";
  const isOfferStep = activeStep === "offer";

  const sep = <ChevronRight size={14} className="shrink-0 text-[var(--text-subtle)]" aria-hidden />;

  return (
    <div
      className={`${compact ? "rounded-lg" : "mb-4 rounded-xl"} border border-[var(--border)] bg-[var(--bg-elevated)]/50 px-3 py-2.5 ${className}`.trim()}
    >
      {!compact ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] sm:text-xs">
          Hiring flow
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-y-2">
        {hiringRequest ? (
          <>
            {requisitionHref && !isRequisitionStep ? (
              <Link href={requisitionHref} className={threadLinkClass}>
                {stepShell(
                  isRequisitionStep,
                  !isRequisitionStep,
                  <>
                    <ClipboardList size={13} className="shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{reqLabel ?? "Requisition"}</span>
                  </>,
                )}
              </Link>
            ) : (
              stepShell(
                isRequisitionStep,
                !isRequisitionStep,
                <>
                  <ClipboardList size={13} className="shrink-0 opacity-80" aria-hidden />
                  <span className="truncate">{reqLabel ?? "Requisition"}</span>
                </>,
              )
            )}
            {sep}
          </>
        ) : (
          <>
            {stepShell(
              false,
              false,
              <>
                <ClipboardList size={13} className="shrink-0 opacity-80" aria-hidden />
                <span className="truncate">No requisition linked</span>
              </>,
            )}
            {sep}
          </>
        )}

        {roleHref && !isRoleStep ? (
          <Link href={roleHref} className={threadLinkClass}>
            {stepShell(
              isRoleStep,
              isPipelineStep || isOfferStep,
              <>
                <FileText size={13} className="shrink-0 opacity-80" aria-hidden />
                <span>Role (JD)</span>
              </>,
            )}
          </Link>
        ) : (
          stepShell(
            isRoleStep,
            isPipelineStep || isOfferStep,
            <>
              <FileText size={13} className="shrink-0 opacity-80" aria-hidden />
              <span>Role (JD)</span>
            </>,
          )
        )}

        {sep}

        {pipelineHref && !isPipelineStep ? (
          <Link href={pipelineHref} className={threadLinkClass}>
            {stepShell(
              isPipelineStep,
              isOfferStep,
              <>
                <GitBranch size={13} className="shrink-0 opacity-80" aria-hidden />
                <span>{dashboardPrefix === "/company" ? "Candidates" : "Pipeline"}</span>
              </>,
            )}
          </Link>
        ) : (
          stepShell(
            isPipelineStep,
            isOfferStep,
            <>
              <GitBranch size={13} className="shrink-0 opacity-80" aria-hidden />
              <span>{dashboardPrefix === "/company" ? "Candidates" : "Pipeline"}</span>
            </>,
          )
        )}

        {sep}

        {!isOfferStep ? (
          <Link href={offerHref} className={threadLinkClass}>
            {stepShell(
              isOfferStep,
              false,
              <>
                <Stamp size={13} className="shrink-0 opacity-80" aria-hidden />
                <span>Offer</span>
              </>,
            )}
          </Link>
        ) : (
          stepShell(
            true,
            false,
            <>
              <Stamp size={13} className="shrink-0 opacity-80" aria-hidden />
              <span>Offer</span>
            </>,
          )
        )}
      </div>
    </div>
  );
}

export function hiringRequestFromJobRow(
  job: Record<string, unknown> | null | undefined,
): RequisitionThreadHiringRequest | null {
  if (!job) return null;
  const raw = job.hiring_requests as
    | RequisitionThreadHiringRequest
    | RequisitionThreadHiringRequest[]
    | null
    | undefined;
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.id) return null;
  return row;
}
