"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { getCompanyInterviewsRedirectForRole } from "@/lib/navigation/primary-nav-by-role";
import { InterviewerInterviewFeedbackActions } from "@/components/dashboard/InterviewerInterviewFeedbackActions";
import { CalendarClock, CheckCircle2 } from "../company-interviews-icons";
import type { UserRole } from "@/types/database";
import { formatDisplayDateTime } from "@/lib/locale/display";

interface AssignedInterviewRow {
  pipelineCandidateId: string;
  jobId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  stageName: string;
  scheduledAt: string;
  feedbackSubmitted: boolean;
  resumeUrl?: string | null;
  jdSummary?: string | null;
  screeningAnswers?: Array<{ question: string; answer: string }>;
}

type AggregateStatus = "upcoming" | "pending_feedback" | "completed" | "cancelled";

interface AggregateInterviewRow {
  slotId: string;
  pipelineCandidateId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  stageName: string;
  interviewerEmail: string | null;
  interviewerName: string | null;
  interviewerUserId: string | null;
  feedbackSubmitted: boolean;
  aggregateStatus: AggregateStatus;
}

const AGGREGATE_ROLES: UserRole[] = ["super_admin", "leadership", "recruiter", "hiring_manager"];

function defaultRange(): { from: string; to: string } {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function statusPillClass(status: AggregateStatus): string {
  switch (status) {
    case "upcoming":
      return "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
    case "pending_feedback":
      return "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]";
    case "completed":
      return "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
    case "cancelled":
      return "bg-[var(--surface)] text-white/60";
    default:
      return "bg-[var(--surface)] text-white/70";
  }
}

function formatAggregateStatus(status: AggregateStatus): string {
  if (status === "pending_feedback") return "Pending feedback";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function schedulingHref(role: UserRole | undefined, jobId: string): string {
  if (role === "hiring_manager") return `/company/jobs/${jobId}`;
  return `/recruit/jobs/${jobId}/interviews`;
}

const INTERVIEWS_REDIRECT_TOAST_KEY = "th-plan-nav-redirect:/company/interviews";

export default function CompanyInterviewsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role;
  const planRedirect = role ? getCompanyInterviewsRedirectForRole(role) : null;

  useEffect(() => {
    if (!planRedirect) return;
    try {
      if (!sessionStorage.getItem(INTERVIEWS_REDIRECT_TOAST_KEY)) {
        sessionStorage.setItem(INTERVIEWS_REDIRECT_TOAST_KEY, "1");
        toast({ title: "This view has moved to Calendar.", tone: "info" });
      }
    } catch {
      toast({ title: "This view has moved to Calendar.", tone: "info" });
    }
    router.replace(planRedirect);
  }, [planRedirect, router, toast]);

  const isInterviewer = role === "interviewer";
  const showAggregate = Boolean(role && AGGREGATE_ROLES.includes(role));

  const interviewerState = useApiQuery<{ interviews: AssignedInterviewRow[] }>(
    isInterviewer ? "/api/interviewer/interviews" : null,
  );

  const [range, setRange] = useState(defaultRange);
  const [statusFilter, setStatusFilter] = useState<AggregateStatus | "all">("all");

  const aggregateUrl = useMemo(() => {
    if (!showAggregate) return null;
    const params = new URLSearchParams();
    params.set("from", range.from);
    params.set("to", range.to);
    if (statusFilter !== "all") {
      params.append("status", statusFilter);
    }
    return `/api/interviews/aggregate?${params.toString()}`;
  }, [showAggregate, range, statusFilter]);

  const aggregateState = useApiQuery<{
    interviews: AggregateInterviewRow[];
    meta?: { cappedAt?: number };
  }>(aggregateUrl);

  if (planRedirect) {
    return <p className="text-sm text-white/60">Opening jobs…</p>;
  }

  if (isInterviewer) {
    const { data, loading, refetch } = interviewerState;
    return (
      <div className="alive-air space-y-6">
        <PageHeader
          title="Interviewer queue"
          subtitle="Your assigned upcoming interviews and feedback status."
        />
        <div className="card-lifted p-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="card-lifted p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : null}
          {!loading && (data?.interviews?.length ?? 0) === 0 && (
            <p className="text-sm text-white/60">No assigned interviews right now.</p>
          )}
          <div className="space-y-3">
            {(data?.interviews ?? []).map((interview) => (
              <div key={interview.pipelineCandidateId} className="card-lifted px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {interview.candidateName}
                    </p>
                    <p className="text-xs text-white/60">
                      {interview.jobTitle} • {interview.stageName}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-white/60">
                      <CalendarClock size={12} />
                      {formatDisplayDateTime(interview.scheduledAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                        interview.feedbackSubmitted
                          ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                          : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                      }`}
                    >
                      {interview.feedbackSubmitted ? <CheckCircle2 size={12} /> : null}
                      {interview.feedbackSubmitted ? "Feedback submitted" : "Feedback pending"}
                    </span>
                    <InterviewerInterviewFeedbackActions
                      jobId={interview.jobId}
                      pipelineCandidateId={interview.pipelineCandidateId}
                      candidateName={interview.candidateName}
                      feedbackSubmitted={interview.feedbackSubmitted}
                      onSubmitted={() => void refetch()}
                    />
                  </div>
                </div>
                {interview.resumeUrl ||
                interview.jdSummary ||
                (interview.screeningAnswers?.length ?? 0) > 0 ? (
                  <details className="mt-3 border-t border-[var(--border)] pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-white/70 hover:text-[var(--text)]">
                      Interview prep
                    </summary>
                    <div className="mt-2 space-y-3 text-xs text-white/70">
                      {interview.resumeUrl ? (
                        <a
                          href={interview.resumeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                        >
                          Open CV / resume
                        </a>
                      ) : null}
                      {interview.jdSummary ? (
                        <div>
                          <p className="mb-1 font-semibold text-white/60">Role summary</p>
                          <p className="whitespace-pre-line text-white/70">{interview.jdSummary}</p>
                        </div>
                      ) : null}
                      {(interview.screeningAnswers?.length ?? 0) > 0 ? (
                        <div>
                          <p className="mb-1 font-semibold text-white/60">Screening answers</p>
                          <ul className="space-y-1">
                            {interview.screeningAnswers!.map((qa, i) => (
                              <li key={i}>
                                <span className="text-white/60">{qa.question}</span>{" "}
                                <span className="font-medium text-white/80">
                                  {qa.answer || "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!showAggregate) {
    return (
      <div className="alive-air space-y-6">
        <PageHeader title="Interviews" subtitle="You do not have access to this calendar." />
        <p className="text-sm text-white/60">
          Sign in with a hiring role to view scheduled interviews.
        </p>
      </div>
    );
  }

  const { data, loading, error } = aggregateState;
  const interviews = data?.interviews ?? [];
  const capped = data?.meta?.cappedAt === 100 && interviews.length === 100;

  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Interview calendar"
        subtitle={
          role === "hiring_manager"
            ? "Booked interviews across roles you manage as hiring manager."
            : "Booked interview slots across your organisation (next window)."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Window:</span>
        {([7, 14, 30] as const).map((days) => (
          <button
            key={days}
            type="button"
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--text)] hover:bg-white/5"
            onClick={() => {
              const from = new Date();
              const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
              setRange({ from: from.toISOString(), to: to.toISOString() });
            }}
          >
            Next {days}d
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">Status:</span>
        {(["all", "upcoming", "pending_feedback", "completed", "cancelled"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-full px-3 py-1 text-xs ${
              statusFilter === key
                ? "bg-white/15 text-[var(--text)]"
                : "border border-white/10 text-white/70 hover:bg-white/5"
            }`}
            onClick={() => setStatusFilter(key)}
          >
            {key === "all" ? "All" : formatAggregateStatus(key)}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[var(--status-danger-fg)]">{error}</p> : null}
      {capped ? (
        <p className="text-xs text-white/50">
          Showing the first 100 interviews in this window. Narrow the date range or add filters when
          the API supports them.
        </p>
      ) : null}

      <div className="card-lifted p-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : null}
        {!loading && interviews.length === 0 && (
          <p className="text-sm text-white/60">No booked interviews in this range.</p>
        )}
        <div className="space-y-3">
          {interviews.map((row) => (
            <div key={row.slotId} className="card-lifted px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text)]">{row.candidateName}</p>
                  <p className="text-xs text-white/60">
                    {row.jobTitle} • {row.stageName}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} />
                      {formatDisplayDateTime(row.scheduledStart)} –{" "}
                      {formatDisplayDateTime(row.scheduledEnd)}
                    </span>
                    <span className="text-white/40">{row.timezone}</span>
                  </p>
                  {(row.interviewerName || row.interviewerEmail) && (
                    <p className="mt-1 text-xs text-white/50">
                      Interviewer: {row.interviewerName ?? row.interviewerEmail}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs ${statusPillClass(row.aggregateStatus)}`}
                  >
                    {formatAggregateStatus(row.aggregateStatus)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                      row.feedbackSubmitted
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                        : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
                    }`}
                  >
                    {row.feedbackSubmitted ? <CheckCircle2 size={12} /> : null}
                    {row.feedbackSubmitted ? "Feedback in" : "No feedback yet"}
                  </span>
                  <Link
                    href={schedulingHref(role, row.jobId)}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Open scheduling
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
