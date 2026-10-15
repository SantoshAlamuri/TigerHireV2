"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { DomainVerification } from "./DomainVerification";

interface PipelineItem {
  id: string;
  interviewScheduledAt: string | null;
  candidateName: string | null;
  jobTitle: string;
}
interface Overview {
  activeJobs: number;
  pendingApplications: number;
  pendingFeedbackCount: number;
  tomorrowInterviewsCount: number;
  overdueFeedbackCount: number;
  upcomingInterviews: PipelineItem[];
  pendingFeedbackPreview: PipelineItem[];
  fitScoreUniqueCandidateCount: number;
  fitScoreAvgOverall: number | null;
  fitScorePairCount: number;
}
interface Activity {
  event_type: string;
  event_detail: string;
  job_title: string | null;
  event_at: string;
}

function dateLabel(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Time to be confirmed";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function ActionLink({
  href,
  title,
  count,
  detail,
}: {
  href: string;
  title: string;
  count: number | null;
  detail?: string;
}) {
  return (
    <Link href={href} className="workspace-action-row">
      <div className="min-w-0">
        <span className="font-semibold">{title}</span>
        {detail && <p className="mt-1 text-sm text-[var(--text-muted)]">{detail}</p>}
      </div>
      <span className="ml-auto shrink-0 text-lg font-semibold tabular-nums">{count ?? "—"}</span>
      <ArrowRight size={16} aria-hidden className="shrink-0 text-[var(--text-muted)]" />
    </Link>
  );
}

export default function CompanyOverviewPage() {
  const [section, setSection] = useState<"today" | "reports">("today");
  const overviewParams = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      metric: "overview",
      tomorrowStart: start.toISOString(),
      tomorrowEnd: end.toISOString(),
    };
  }, []);
  const { data, loading, error, refetch } = useApiQuery<{ overview: Overview }>(
    "/api/analytics",
    overviewParams,
  );
  const approvals = useApiQuery<{ items?: unknown[]; pendingApprovals?: unknown[] }>(
    section === "today" ? "/api/approvals" : null,
  );
  const activity = useApiQuery<{ activity: Activity[] }>(
    section === "reports" ? "/api/analytics" : null,
    { metric: "activity" },
  );
  const ov = data?.overview;
  const approvalCount =
    !approvals.error && approvals.data
      ? (approvals.data.items ?? approvals.data.pendingApprovals ?? []).length
      : null;
  const metrics = [
    { label: "Open jobs", value: ov?.activeJobs, href: "/company/jobs?status=open" },
    { label: "New applications", value: ov?.pendingApplications, href: "/recruit/applications" },
    {
      label: "Feedback pending",
      value: ov?.pendingFeedbackCount,
      href: "/recruit/pipeline?focus=needs-feedback",
    },
    {
      label: "Interviews tomorrow",
      value: ov?.tomorrowInterviewsCount,
      href: "/company/interviews",
    },
  ];
  return (
    <div className="hiring-workspace space-y-5">
      <PageHeader
        title="Hiring overview"
        subtitle="Your team's next decisions, all in one place."
        actions={
          <>
            <Link href="/company/jobs" className={buttonClasses("secondary", "sm")}>
              View jobs
            </Link>
            <Link href="/company/hiring-requests/new" className={buttonClasses("primary", "sm")}>
              <Plus size={16} />
              Request a role
            </Link>
          </>
        }
      />
      <nav aria-label="Overview sections" className="workspace-tabs">
        {(
          [
            ["today", "Today"],
            ["reports", "Reports"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={section === key ? "page" : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {loading && !ov ? (
        <div role="status" aria-label="Loading hiring overview" className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : error || !ov ? (
        <div className="workspace-panel" role="alert">
          <p>Could not load hiring overview.</p>
          <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <dl className="workspace-metrics">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt className="text-sm text-[var(--text-muted)]">{metric.label}</dt>
                <dd>
                  <Link
                    className="inline-block text-2xl font-semibold tabular-nums"
                    href={metric.href}
                  >
                    {metric.value ?? "—"}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
          {section === "today" ? (
            <div className="grid items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
              <section className="workspace-panel">
                <h2 className="workspace-heading">Needs attention</h2>
                <div className="mt-3 divide-y divide-[var(--border)]">
                  <ActionLink
                    href="/company/approvals"
                    title="Approvals"
                    count={approvalCount}
                    detail={
                      approvals.error
                        ? "Could not load approvals"
                        : approvalCount === null
                          ? "Loading your approval queue…"
                          : approvalCount
                            ? "Ready for your decision"
                            : "No approvals waiting"
                    }
                  />
                  {approvals.error && (
                    <Button variant="ghost" size="sm" onClick={() => void approvals.refetch()}>
                      Retry approvals
                    </Button>
                  )}
                  <ActionLink
                    href="/recruit/applications"
                    title="Review applications"
                    count={ov.pendingApplications}
                    detail={
                      ov.pendingApplications
                        ? "New candidates waiting for review"
                        : "No new applications waiting"
                    }
                  />
                  <ActionLink
                    href="/recruit/pipeline?focus=needs-feedback"
                    title="Complete feedback"
                    count={ov.pendingFeedbackCount}
                    detail={
                      ov.overdueFeedbackCount
                        ? `${ov.overdueFeedbackCount} overdue`
                        : ov.pendingFeedbackCount
                          ? "Add the interview outcome"
                          : "Feedback is up to date"
                    }
                  />
                </div>
              </section>
              <section className="workspace-panel">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="workspace-heading">Upcoming interviews</h2>
                  <Link
                    href="/company/interviews"
                    className="text-sm text-[var(--text-muted)] underline underline-offset-4"
                  >
                    View all
                  </Link>
                </div>
                {(ov.upcomingInterviews ?? []).length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--text-muted)]">No interviews scheduled.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--border)]">
                    {ov.upcomingInterviews.slice(0, 4).map((item) => (
                      <li key={item.id} className="py-3">
                        <p className="font-medium">{item.candidateName ?? "Candidate"}</p>
                        <p className="text-sm text-[var(--text-muted)]">{item.jobTitle}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {dateLabel(item.interviewScheduledAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="workspace-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="workspace-heading">Candidate evaluation</h2>
                  <Link href="/recruit/analytics" className={buttonClasses("secondary", "sm")}>
                    Open full reports
                  </Link>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ["Candidates evaluated", ov.fitScoreUniqueCandidateCount],
                    ["Role–candidate evaluations", ov.fitScorePairCount],
                    [
                      "Average fit score",
                      ov.fitScorePairCount > 0 && ov.fitScoreAvgOverall != null
                        ? Math.round(ov.fitScoreAvgOverall)
                        : "—",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="workspace-panel">
                <h2 className="workspace-heading">Recent activity</h2>
                {activity.loading ? (
                  <Skeleton className="mt-3 h-24" />
                ) : activity.error ? (
                  <div role="alert" className="mt-3 text-sm">
                    Could not load recent activity.{" "}
                    <Button variant="ghost" size="sm" onClick={() => void activity.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : (activity.data?.activity ?? []).length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">No recent activity.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--border)]">
                    {activity.data!.activity.slice(0, 8).map((item, index) => (
                      <li key={`${item.event_at}-${index}`} className="py-3">
                        <p className="text-sm">
                          {item.event_detail.replaceAll("_", " ") ||
                            item.event_type.replaceAll("_", " ")}
                          {item.job_title ? ` · ${item.job_title}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {dateLabel(item.event_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <Link href="/recruit/v2/portfolio" className={buttonClasses("secondary", "sm")}>
                View hiring portfolio
              </Link>
              <DomainVerification />
            </div>
          )}
        </>
      )}
    </div>
  );
}
