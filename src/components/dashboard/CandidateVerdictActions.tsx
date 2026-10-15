"use client";

import { useState } from "react";
import { Eye, Star, XCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useOptimisticMutation } from "@/lib/hooks/use-api";
import { getApplicationStatusTone } from "@/lib/status-tones";
import type { ApplicationStatus } from "@/types";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "New",
  viewed: "Viewed",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
  withdrawn: "Withdrawn",
};

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-[var(--border-interactive)] px-3.5 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const REJECT_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 px-3.5 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Inline next-action controls for a candidate's application, surfaced next to the
 * scorecard/verdict. Mirrors the applications-page status flow: optimistic update,
 * success/error toast, and a 5-second undo window on reject. Exactly one filled
 * primary action per state; the rest are demoted to secondary.
 */
export function CandidateVerdictActions({
  applicationId,
  status,
  jobTitle,
  onStatusChange,
  compact = false,
}: {
  applicationId: string;
  status: ApplicationStatus;
  jobTitle?: string | null;
  onStatusChange?: () => void | Promise<unknown>;
  /** Bare buttons only (Shortlist/Mark hired + Reject) — no card, label, badge, or Mark viewed. */
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  const [delayedRejectTimer, setDelayedRejectTimer] = useState<number | null>(null);
  const effectiveStatus = pendingStatus ?? status;

  const { mutate, loading: statusUpdating } = useOptimisticMutation<
    Record<string, unknown>,
    { status: ApplicationStatus }
  >(`/api/applications/${applicationId}`, {
    method: "PATCH",
    onMutate: (variables) => {
      setPendingStatus(variables.status);
      return () => setPendingStatus(null);
    },
    onSuccess: async () => {
      setPendingStatus(null);
      await onStatusChange?.();
      toast({ title: "Application updated", description: "Status saved.", tone: "success" });
    },
    onError: (err, variables) => {
      setPendingStatus(null);
      toast({
        title: "Couldn't update application",
        description: err.message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void mutate(variables);
          },
        },
      });
    },
  });

  function commitStatus(next: ApplicationStatus) {
    void mutate({ status: next });
  }

  function handleStatusUpdate(next: ApplicationStatus) {
    if (next !== "rejected") {
      commitStatus(next);
      return;
    }
    // Reject gets a 5s grace period with an Undo toast (mirrors applications page).
    setPendingStatus("rejected");
    const timer = window.setTimeout(() => {
      commitStatus("rejected");
      setDelayedRejectTimer(null);
    }, 5000);
    setDelayedRejectTimer(timer);
    toast({
      title: "Application will be rejected",
      description: "Undo within 5 seconds to keep candidate in current stage.",
      tone: "warning",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          if (delayedRejectTimer !== null) window.clearTimeout(delayedRejectTimer);
          window.clearTimeout(timer);
          setDelayedRejectTimer(null);
          setPendingStatus(null);
        },
      },
    });
  }

  // Terminal / non-actionable states: withdrawn shows nothing, hired is a decided outcome.
  if (effectiveStatus === "withdrawn") return null;

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 px-4 py-3"
      }
    >
      {compact ? null : (
        <div className="mr-1 flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/55">
            Next action
          </span>
          <StatusBadge tone={getApplicationStatusTone(effectiveStatus)} size="sm">
            {STATUS_LABEL[effectiveStatus]}
          </StatusBadge>
          {jobTitle ? (
            <span className="hidden truncate text-xs text-white/50 sm:inline">· {jobTitle}</span>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(effectiveStatus === "applied" || effectiveStatus === "viewed") && (
          <button
            type="button"
            onClick={() => handleStatusUpdate("shortlisted")}
            disabled={statusUpdating}
            className={PRIMARY_BUTTON_CLASS}
          >
            <Star size={15} />
            Shortlist
          </button>
        )}
        {effectiveStatus === "applied" && !compact && (
          <button
            type="button"
            onClick={() => handleStatusUpdate("viewed")}
            disabled={statusUpdating}
            className={SECONDARY_BUTTON_CLASS}
          >
            <Eye size={15} />
            Mark viewed
          </button>
        )}
        {effectiveStatus === "shortlisted" && (
          <button
            type="button"
            onClick={() => handleStatusUpdate("hired")}
            disabled={statusUpdating}
            className={PRIMARY_BUTTON_CLASS}
          >
            <CheckCircle2 size={15} />
            Mark hired
          </button>
        )}
        {(effectiveStatus === "applied" ||
          effectiveStatus === "viewed" ||
          effectiveStatus === "shortlisted") && (
          <button
            type="button"
            onClick={() => handleStatusUpdate("rejected")}
            disabled={statusUpdating}
            className={REJECT_BUTTON_CLASS}
          >
            <XCircle size={15} />
            Reject
          </button>
        )}
        {effectiveStatus === "rejected" && (
          <button
            type="button"
            onClick={() => handleStatusUpdate("shortlisted")}
            disabled={statusUpdating}
            className={SECONDARY_BUTTON_CLASS}
          >
            <RotateCcw size={15} />
            Reconsider
          </button>
        )}
        {effectiveStatus === "hired" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300">
            <CheckCircle2 size={15} />
            Hired — no further action
          </span>
        )}
      </div>
    </div>
  );
}
