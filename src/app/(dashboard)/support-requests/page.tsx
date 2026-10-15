"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Star } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";
import {
  SUPPORT_REQUEST_STATUSES,
  type SubmitSupportFeedbackInput,
} from "@/lib/validations/support";

type MySupportRequest = {
  id: string;
  ticketNumber: string;
  created_at: string;
  updated_at: string;
  category: string;
  priority: string;
  status: (typeof SUPPORT_REQUEST_STATUSES)[number];
  owner_team: string;
  assignee_user_id: string | null;
  subject: string;
  description: string;
  context_path: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
  feedback_submitted_at: string | null;
};

type MySupportResponse = {
  requests: MySupportRequest[];
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUnauthorizedError(error: string | null): boolean {
  if (!error) return false;
  return error.trim().toLowerCase() === "unauthorized";
}

export default function MySupportRequestsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<
    "all" | (typeof SUPPORT_REQUEST_STATUSES)[number]
  >("all");
  const [feedbackDraftById, setFeedbackDraftById] = useState<
    Record<string, { rating: number; comment: string }>
  >({});
  const [submittingFeedbackId, setSubmittingFeedbackId] = useState<string | null>(null);
  const unauthorizedRetryCountRef = useRef(0);

  const queryParams = useMemo(
    () => ({
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      limit: 100,
    }),
    [statusFilter],
  );

  const { data, loading, error, refetch, mergeData } = useApiQuery<MySupportResponse>(
    "/api/support-requests",
    queryParams,
  );

  useEffect(() => {
    function handleSupportRequestCreated() {
      void refetch({ silent: true });
    }
    window.addEventListener("support-request:created", handleSupportRequestCreated);
    return () => {
      window.removeEventListener("support-request:created", handleSupportRequestCreated);
    };
  }, [refetch]);

  useEffect(() => {
    if (!isUnauthorizedError(error)) {
      unauthorizedRetryCountRef.current = 0;
      return;
    }
    // Session cookies can be briefly stale right after auth transitions; retry automatically.
    if (unauthorizedRetryCountRef.current >= 2) return;
    unauthorizedRetryCountRef.current += 1;
    const timer = window.setTimeout(() => {
      void refetch({ silent: true });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [error, refetch]);

  const requests = data?.requests ?? [];
  const openCount = requests.filter(
    (r) => r.status !== "resolved" && r.status !== "cancelled",
  ).length;
  const resolvedCount = requests.filter((r) => r.status === "resolved").length;

  async function submitFeedback(input: SubmitSupportFeedbackInput) {
    setSubmittingFeedbackId(input.id);
    try {
      const response = await fetch("/api/support-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        request?: MySupportRequest;
      };
      if (!response.ok || !payload.request) {
        throw new Error(payload.error ?? "Could not submit feedback.");
      }
      mergeData((prev) => {
        const existing = prev?.requests ?? [];
        return {
          requests: existing.map((row) =>
            row.id === payload.request!.id ? payload.request! : row,
          ),
        };
      });
      toast({ title: "Feedback submitted. Thanks!", tone: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not submit feedback.",
        tone: "error",
      });
    } finally {
      setSubmittingFeedbackId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="My Support Requests"
        subtitle="Track open tickets, resolutions, and share feedback after closure."
      />
      <div className="card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl p-4">
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-white/70">
          Open: <span className="font-semibold text-[var(--text)]">{openCount}</span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-white/70">
          Resolved: <span className="font-semibold text-[var(--text)]">{resolvedCount}</span>
        </span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | (typeof SUPPORT_REQUEST_STATUSES)[number])
          }
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="all">All statuses</option>
          {SUPPORT_REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => refetch({ silent: false })}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-white/80 hover:bg-[var(--surface)]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {isUnauthorizedError(error)
            ? "Your session has expired. Please sign in again to view your support requests."
            : error}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((row) => {
            const draft = feedbackDraftById[row.id] ?? { rating: 5, comment: "" };
            const canSubmitFeedback =
              row.status === "resolved" &&
              row.feedback_submitted_at == null &&
              row.feedback_rating == null;
            return (
              <div key={row.id} className="card-lifted rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {row.ticketNumber} · {row.subject}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {row.category} · {row.priority.toUpperCase()} · {row.status}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-2 py-1 text-xs text-white/70">
                    <MessageCircle size={12} />
                    {formatDateTime(row.created_at)}
                  </span>
                </div>

                <p className="mt-3 text-sm text-white/75">{row.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/60">
                  <span>Owner: {row.owner_team || "—"}</span>
                  <span>Assignee: {row.assignee_user_id ?? "Unassigned"}</span>
                  <span>Resolved: {formatDateTime(row.resolved_at)}</span>
                </div>

                {row.resolution_notes ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-3">
                    <p className="text-xs uppercase tracking-wide text-white/50">Resolution</p>
                    <p className="mt-1 text-sm text-white/75">{row.resolution_notes}</p>
                  </div>
                ) : null}

                {canSubmitFeedback ? (
                  <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
                    <p className="text-xs uppercase tracking-wide text-white/50">Feedback loop</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                      <label className="text-xs text-white/70">
                        Rating
                        <select
                          value={draft.rating}
                          onChange={(e) =>
                            setFeedbackDraftById((prev) => ({
                              ...prev,
                              [row.id]: { ...draft, rating: Number(e.target.value) || 5 },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)]"
                        >
                          {[5, 4, 3, 2, 1].map((rating) => (
                            <option key={rating} value={rating}>
                              {rating} / 5
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-white/70">
                        Comment (optional)
                        <input
                          value={draft.comment}
                          onChange={(e) =>
                            setFeedbackDraftById((prev) => ({
                              ...prev,
                              [row.id]: { ...draft, comment: e.target.value },
                            }))
                          }
                          placeholder="How was your support experience?"
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)]"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={submittingFeedbackId === row.id}
                        onClick={() =>
                          void submitFeedback({
                            id: row.id,
                            rating: draft.rating,
                            comment: draft.comment,
                          })
                        }
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                      >
                        <Star size={13} />
                        Submit feedback
                      </button>
                    </div>
                  </div>
                ) : null}

                {row.feedback_submitted_at ? (
                  <p className="mt-3 text-xs text-emerald-300">
                    Feedback submitted: {row.feedback_rating}/5 on{" "}
                    {formatDateTime(row.feedback_submitted_at)}
                  </p>
                ) : null}
              </div>
            );
          })}
          {requests.length === 0 ? (
            <div className="card-lifted rounded-xl p-6 text-center text-sm text-white/60">
              No support requests yet.
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
