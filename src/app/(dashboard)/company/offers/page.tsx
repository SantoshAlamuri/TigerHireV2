"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { HiringOfferAuditTimeline } from "@/components/dashboard/HiringOfferAuditTimeline";
import { OfferSigningPanel } from "@/components/dashboard/OfferSigningPanel";
import {
  RequisitionThreadBanner,
  hiringRequestFromJobRow,
} from "@/components/dashboard/RequisitionThreadBanner";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";

interface OfferRow {
  id: string;
  application_id?: string;
  role_title: string;
  status: string;
  signing_status?: string | null;
  company_signed_at?: string | null;
  start_date: string;
  created_at: string;
  sent_at?: string | null;
  band_status?: string | null;
  applications?:
    | {
        job_id?: string | null;
        jobs?: Record<string, unknown> | Record<string, unknown>[] | null;
      }
    | Array<{
        job_id?: string | null;
        jobs?: Record<string, unknown> | Record<string, unknown>[] | null;
      }>
    | null;
}

export default function CompanyOffersPage() {
  const { user } = useAuth();
  const {
    data,
    loading,
    error: listError,
    refetch,
  } = useApiQuery<{ offers: OfferRow[] }>("/api/offers");
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);
  const [hmApprovingId, setHmApprovingId] = useState<string | null>(null);
  const [recallingOfferId, setRecallingOfferId] = useState<string | null>(null);
  const [regeneratingOfferId, setRegeneratingOfferId] = useState<string | null>(null);
  const [returningToDraftId, setReturningToDraftId] = useState<string | null>(null);
  const [auditOpenId, setAuditOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const isCompanyAdmin = user?.role === "leadership";
  const isRecruiterWorkspace = user?.role === "recruiter" || user?.role === "super_admin";

  async function handleReturnToDraft(offerId: string) {
    setReturningToDraftId(offerId);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/offers/${offerId}/return-to-draft`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setActionError(payload?.error ?? "Unable to open for revision");
        return;
      }
      setNotice("Offer moved to draft. Edit the terms, then send again when ready.");
      await refetch();
    } finally {
      setReturningToDraftId(null);
    }
  }

  function offerSignatureBadge(offer: OfferRow): { label: string; className: string } | null {
    if (offer.status !== "sent") return null;
    if (offer.signing_status === "pending_company") {
      return {
        label: "Awaiting company signature",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      };
    }
    const candidatePending =
      Boolean(offer.company_signed_at) &&
      (offer.signing_status === "sent" || offer.signing_status === "viewed");
    if (candidatePending) {
      return {
        label: "Company signed - candidate pending",
        className: "border-sky-500/40 bg-sky-500/10 text-sky-200",
      };
    }
    return null;
  }

  async function handleRecall(offerId: string) {
    setRecallingOfferId(offerId);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/offers/${offerId}/recall`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setActionError(payload?.error ?? "Unable to recall offer");
        return;
      }
      setNotice("Offer withdrawn. The candidate link no longer works.");
      await refetch();
    } finally {
      setRecallingOfferId(null);
    }
  }

  async function handleCancelAndRegenerate(offerId: string) {
    setRegeneratingOfferId(offerId);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/offers/${offerId}/cancel-and-regenerate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setActionError(payload?.error ?? "Unable to cancel and regenerate offer");
        return;
      }
      setNotice("Offer cancelled and a fresh draft was created. Review terms, approve, then send.");
      await refetch();
    } finally {
      setRegeneratingOfferId(null);
    }
  }

  const canApproveDraft = user && (user.role === "hiring_manager" || user.role === "super_admin");

  async function handleHiringManagerApprove(offerId: string) {
    setHmApprovingId(offerId);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/offers/${offerId}/hiring-manager-approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setActionError(payload?.error ?? "Unable to approve draft");
        return;
      }
      setNotice("Offer approved. Finance will be notified only if a band exception applies.");
      await refetch();
    } finally {
      setHmApprovingId(null);
    }
  }

  async function handleSend(offer: OfferRow) {
    const offerId = offer.id;
    setSendingOfferId(offerId);
    setNotice(null);
    setActionError(null);
    try {
      if (isCompanyAdmin && offer.status === "draft") {
        const approveResponse = await fetch(`/api/offers/${offerId}/hiring-manager-approve`, {
          method: "POST",
          credentials: "include",
        });
        if (!approveResponse.ok) {
          const payload = (await approveResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          setActionError(payload?.error ?? "Unable to approve draft");
          return;
        }
      }

      const response = await fetch(`/api/offers/${offerId}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 202) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setNotice(payload?.message ?? "Band exception approval requested. Check approver email.");
        await refetch();
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (
          isCompanyAdmin &&
          offer.status === "draft" &&
          payload?.error === "Only approved offers can be sent"
        ) {
          setNotice("Offer approved. Finance review is required before sending.");
          await refetch();
          return;
        }
        setActionError(payload?.error ?? "Unable to send offer");
        return;
      }
      setNotice("Offer sent successfully.");
      await refetch();
    } finally {
      setSendingOfferId(null);
    }
  }

  return (
    <div className="alive-air space-y-8">
      <PageHeader
        title="Offers"
        subtitle="Create and track offer rollout from one place: draft → approval → finance (if required) → send."
      />
      <section
        aria-labelledby="offers-one-time-setup"
        className="card-lifted rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/30 px-5 py-6 sm:px-7 sm:py-7"
      >
        <h2
          id="offers-one-time-setup"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50"
        >
          One-time setup
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/72">
          Configure these once, then use the offer draft workspace for day-to-day offer creation.
        </p>
        <div className="mt-6 border-t border-white/[0.08] pt-6">
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/company/settings/compensation-bands"
              className="inline-flex min-h-9 items-center rounded-lg border border-[var(--border)] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-hover)] hover:bg-white/[0.06]"
            >
              Offer letter flow
            </Link>
            <Link
              href="/company/settings/templates?tab=offer-letters"
              className="inline-flex min-h-9 items-center rounded-lg border border-[var(--border)] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-hover)] hover:bg-white/[0.06]"
            >
              Templates
            </Link>
            <Link
              href="/company/settings/offer-approval-workflow"
              className="inline-flex min-h-9 items-center rounded-lg border border-[var(--border)] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-hover)] hover:bg-white/[0.06]"
            >
              Offer approval workflow
            </Link>
          </div>
        </div>
      </section>
      <div className="card-lifted rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-5 py-5 sm:px-6">
        <p className="text-sm leading-relaxed text-white/70">
          Entry point for new offer drafts is{" "}
          <span className="font-semibold text-[var(--text)]">Pipeline stage</span>. Move candidate
          to Offer stage, open candidate profile, then start draft flow.
        </p>
      </div>
      <div className="card-lifted rounded-xl p-5 sm:p-6">
        {actionError ? <p className="mb-3 text-xs text-red-300">{actionError}</p> : null}
        {notice ? <p className="mb-3 text-xs text-emerald-300">{notice}</p> : null}
        {listError ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="px-2 text-center text-sm text-red-400">{listError}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.04]"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card-lifted px-3 py-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (data?.offers?.length ?? 0) === 0 ? (
          <div className="mx-auto max-w-md py-4 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">No offers yet</h2>
            <p className="text-body mt-2 text-sm text-white/60">
              After you move a candidate to the offer stage, open their profile to create a draft.
              It appears here through approval, finance (when required), and send.
            </p>
            <div className="mt-3 rounded-lg border border-[var(--border)]/70 bg-[var(--bg-elevated)]/40 px-3 py-2 text-left text-xs text-white/60">
              Flow: draft → hiring manager sign-off → finance if needed → send to candidate
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:items-center">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  href={
                    isRecruiterWorkspace || isCompanyAdmin
                      ? "/recruit/pipeline"
                      : "/company/my-pipeline"
                  }
                  className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  Open pipeline
                </Link>
                <Link
                  href="/recruit/candidates"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  Candidates
                </Link>
                <Link
                  href={isRecruiterWorkspace ? "/recruit" : "/company/hiring-requests"}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  {isRecruiterWorkspace ? "Recruiter home" : "Hiring requests"}
                </Link>
              </div>
            </div>
          </div>
        ) : null}
        {!listError && !loading && (data?.offers?.length ?? 0) > 0 ? (
          <div className="space-y-3">
            {(data?.offers ?? []).map((offer) => (
              <div key={offer.id} className="card-lifted px-3 py-3">
                {(() => {
                  const signatureBadge = offerSignatureBadge(offer);
                  return signatureBadge ? (
                    <div className="mb-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${signatureBadge.className}`}
                      >
                        {signatureBadge.label}
                      </span>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const applicationSource = offer.applications;
                  const application = Array.isArray(applicationSource)
                    ? applicationSource[0]
                    : applicationSource;
                  const jobSource = application?.jobs;
                  const jobRow = Array.isArray(jobSource) ? jobSource[0] : (jobSource ?? null);
                  const jobId =
                    (jobRow?.id as string | undefined) ??
                    (application?.job_id as string | undefined) ??
                    null;
                  const dashboardPrefix = isRecruiterWorkspace ? "/recruit" : "/company";
                  return (
                    <RequisitionThreadBanner
                      dashboardPrefix={dashboardPrefix}
                      activeStep="offer"
                      hiringRequest={
                        jobRow && typeof jobRow === "object"
                          ? hiringRequestFromJobRow(jobRow as Record<string, unknown>)
                          : null
                      }
                      jobId={jobId}
                      applicationId={offer.application_id}
                      compact
                      className="mb-3"
                    />
                  );
                })()}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{offer.role_title}</p>
                    <p className="text-xs text-white/60">
                      {offer.status} • starts{" "}
                      {new Date(offer.start_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                      {offer.band_status ? (
                        <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                          band: {offer.band_status.replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAuditOpenId((cur) => (cur === offer.id ? null : offer.id))}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                    >
                      {auditOpenId === offer.id ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      Audit
                    </button>
                    {offer.status === "negotiating" ? (
                      <button
                        type="button"
                        disabled={Boolean(returningToDraftId)}
                        title="Edit compensation and terms, then re-approve and re-send"
                        onClick={() => void handleReturnToDraft(offer.id)}
                        className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {returningToDraftId === offer.id ? "Opening…" : "Open for revision"}
                      </button>
                    ) : null}
                    {offer.status === "draft" && canApproveDraft ? (
                      <button
                        type="button"
                        disabled={Boolean(hmApprovingId)}
                        onClick={() => handleHiringManagerApprove(offer.id)}
                        className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                      >
                        {hmApprovingId === offer.id ? "Approving…" : "Approve draft"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        Boolean(sendingOfferId) ||
                        (offer.status !== "approved" &&
                          !(isCompanyAdmin && offer.status === "draft"))
                      }
                      onClick={() => handleSend(offer)}
                      className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {sendingOfferId === offer.id
                        ? "Sending..."
                        : isCompanyAdmin && offer.status === "draft"
                          ? "Approve & Send"
                          : "Send Offer"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(regeneratingOfferId) || offer.status !== "sent"}
                      title="Withdraw current offer and create a fresh draft"
                      onClick={() => void handleCancelAndRegenerate(offer.id)}
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      {regeneratingOfferId === offer.id ? "Regenerating…" : "Cancel & regenerate"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(recallingOfferId) || offer.status !== "sent"}
                      title="Withdraw offer — candidate link stops working"
                      onClick={() => handleRecall(offer.id)}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] disabled:opacity-50"
                    >
                      {recallingOfferId === offer.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                  </div>
                </div>
                {offer.sent_at ? <OfferSigningPanel offerId={offer.id} /> : null}
                {auditOpenId === offer.id && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <HiringOfferAuditTimeline
                      entityType="offer"
                      entityId={offer.id}
                      title="Offer activity"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
