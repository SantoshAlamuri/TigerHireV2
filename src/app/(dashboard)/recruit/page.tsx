"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Briefcase,
  Zap,
  TrendingUp,
  Loader2,
  GitPullRequest,
  Inbox,
  Calendar,
  MessageSquare,
  Activity,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RecruitHubQuickLinks } from "@/components/dashboard/RecruitHubQuickLinks";
import { Skeleton } from "@/components/ui/Skeleton";
import StatCard from "@/components/dashboard/StatCard";
import CandidateRow from "@/components/dashboard/CandidateRow";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbCandidateToView } from "@/lib/mappers";

interface ActivityRow {
  event_type: string;
  event_detail: string;
  job_title: string | null;
  event_at: string;
}

interface OverviewPipelineItem {
  id: string;
  interviewScheduledAt: string | null;
  interviewOutcome: string | null;
  candidateName: string | null;
  jobTitle: string;
}

interface AnalyticsOverview {
  activeJobs: number;
  pendingApplications: number;
  pipelineCount: number;
  pendingFeedbackCount: number;
  tomorrowInterviewsCount: number;
  overdueFeedbackCount: number;
  upcomingInterviews: OverviewPipelineItem[];
  pendingFeedbackPreview: OverviewPipelineItem[];
  /** Latest FitScore per job–candidate pair (excludes test runs). */
  fitScorePairCount: number;
  fitScoreStrongMatchCount: number;
  fitScoreAvgOverall: number | null;
  tomorrowWindowStartIso: string;
  tomorrowWindowEndIso: string;
}

function localTomorrowIsoBounds(): { tomorrowStart: string; tomorrowEnd: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { tomorrowStart: start.toISOString(), tomorrowEnd: end.toISOString() };
}

export default function RecruiterOverviewPage() {
  const router = useRouter();
  const [funnelJobId, setFunnelJobId] = useState("");

  const { data: jobsListData } = useApiQuery<{
    jobs: { id: string; title: string }[];
  }>("/api/jobs", { limit: 30, page: 1, status: "open" });

  const { data: funnelData, loading: funnelLoading } = useApiQuery<{
    funnel: {
      total: number;
      byStatus: Record<string, number>;
    };
  }>(funnelJobId ? "/api/analytics" : null, { metric: "funnel", jobId: funnelJobId });

  useEffect(() => {
    const jobs = jobsListData?.jobs ?? [];
    if (!funnelJobId && jobs.length > 0) {
      setFunnelJobId(jobs[0]!.id);
    }
  }, [jobsListData, funnelJobId]);

  const overviewParams = useMemo(() => {
    const { tomorrowStart, tomorrowEnd } = localTomorrowIsoBounds();
    return {
      metric: "overview" as const,
      tomorrowStart,
      tomorrowEnd,
    };
  }, []);

  const {
    data: candidatesData,
    loading: cLoading,
    error: cError,
    refetch: refetchCandidates,
  } = useApiQuery<{
    candidates: Record<string, unknown>[];
    pagination: { total: number };
  }>("/api/candidates", {
    limit: 5,
    sortBy: "intent_score",
    sortOrder: "desc",
  });

  const {
    data: overviewData,
    loading: oLoading,
    error: oError,
    refetch: refetchOverview,
  } = useApiQuery<{
    overview: AnalyticsOverview;
  }>("/api/analytics", overviewParams);

  const {
    data: activityData,
    loading: acLoading,
    error: acError,
    refetch: refetchActivity,
  } = useApiQuery<{
    activity: ActivityRow[];
  }>("/api/analytics", { metric: "activity" });

  const candidates = candidatesData?.candidates?.map(mapDbCandidateToView) ?? [];
  const totalCandidates = candidatesData?.pagination?.total ?? 0;
  const activeJobs = overviewData?.overview?.activeJobs ?? 0;

  const ov = overviewData?.overview;
  const fitScorePairCount = ov?.fitScorePairCount ?? 0;
  const strongMatches = ov?.fitScoreStrongMatchCount ?? 0;
  const avgFitScore = ov?.fitScoreAvgOverall ?? null;

  const pipelineCount = overviewData?.overview?.pipelineCount ?? 0;
  const pendingApplications = overviewData?.overview?.pendingApplications ?? 0;
  const pendingFeedbackCount = overviewData?.overview?.pendingFeedbackCount ?? 0;
  const tomorrowInterviewsCount = overviewData?.overview?.tomorrowInterviewsCount ?? 0;
  const overdueFeedbackCount = overviewData?.overview?.overdueFeedbackCount ?? 0;
  const upcomingInterviews = overviewData?.overview?.upcomingInterviews ?? [];
  const pendingFeedbackPreview = overviewData?.overview?.pendingFeedbackPreview ?? [];

  const recentActivity = (activityData?.activity ?? []).slice(0, 5);

  /** Bounded 0–100 workload index from backlog signals (heuristic, not ML). */
  const workloadIndex = Math.min(
    100,
    pendingApplications * 2 + pendingFeedbackCount * 14 + overdueFeedbackCount * 10,
  );
  const urgency =
    workloadIndex >= 70
      ? {
          label: "Critical",
          className: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
        }
      : workloadIndex >= 40
        ? {
            label: "Medium",
            className: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
          }
        : {
            label: "Low",
            className: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
          };
  const loading = oLoading || acLoading || cLoading;
  const overviewError = cError ?? oError ?? acError;

  async function handleRetryOverview() {
    await Promise.all([refetchCandidates(), refetchOverview(), refetchActivity()]);
  }

  return (
    <>
      <PageHeader
        title="Recruiter Dashboard"
        subtitle="What is coming up, what changed, and what needs action"
      />
      <RecruitHubQuickLinks />
      {loading ? (
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="card-lifted space-y-2 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="card-lifted space-y-3 p-5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : overviewError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-16">
          <p className="px-4 text-center text-sm text-red-400">{overviewError}</p>
          <button
            type="button"
            onClick={() => void handleRetryOverview()}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04]"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr] lg:gap-4">
            <section className="card-lifted p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Today&apos;s focus
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {pendingFeedbackCount > 0
                  ? `${pendingFeedbackCount} interviews need outcome updates`
                  : "Feedback backlog is clear"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/65">
                Keep recruiter bandwidth on interview decisions and tomorrow&apos;s schedule risk.
                Workload index is currently {workloadIndex}/100 with {urgency.label.toLowerCase()}{" "}
                urgency.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/recruit/pipeline?focus=needs-feedback")}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Resolve feedback queue
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/recruit/pipeline?focus=tomorrow-plan")}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  Build tomorrow plan
                </button>
              </div>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="card-lifted p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                  Interviews tomorrow
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text)]">
                  {tomorrowInterviewsCount}
                </p>
                <p className="mt-1 text-xs text-white/65">Scheduled in the next planning window.</p>
              </div>
              <div className="card-lifted p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                  Strong matches
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text)]">
                  {strongMatches}
                </p>
                <p className="mt-1 text-xs text-white/65">
                  Candidates currently scoring 80+ on FitScore.
                </p>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Total Candidates"
              value={totalCandidates.toLocaleString()}
              icon={<Users size={20} />}
              href="/recruit/candidates"
            />
            <StatCard
              label="Active Jobs"
              value={activeJobs.toLocaleString()}
              icon={<Briefcase size={20} />}
              href="/recruit/jobs"
            />
            <StatCard
              label="Strong matches (≥80)"
              value={strongMatches.toLocaleString()}
              icon={<Zap size={20} />}
              href="/recruit/pipeline?focus=strong-matches"
            />
            <StatCard
              label="Avg FitScore"
              value={fitScorePairCount > 0 && avgFitScore != null ? `${avgFitScore}` : "—"}
              icon={<TrendingUp size={20} />}
              href="/recruit/analytics"
            />
            <StatCard
              label="In Pipeline"
              value={pipelineCount.toLocaleString()}
              icon={<GitPullRequest size={20} />}
              href="/recruit/pipeline"
            />
            <StatCard
              label="New applications (applied)"
              value={pendingApplications.toLocaleString()}
              icon={<Inbox size={20} />}
              href="/recruit/applications"
            />
          </div>

          <div className="card-lifted p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="heading-section text-sm text-[var(--text)]">
                Application funnel (per job)
              </h2>
              <BarChart3 size={16} className="text-[var(--accent)]" />
            </div>
            <p className="mb-3 text-xs text-white/45">
              Counts from application status for the selected open job. Open{" "}
              <button
                type="button"
                onClick={() => router.push("/recruit/analytics")}
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Analytics
              </button>{" "}
              for charts, sources, and exports.
            </p>
            {(jobsListData?.jobs ?? []).length > 0 ? (
              <label className="mb-4 block max-w-md text-xs text-white/65">
                Job
                <select
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  value={funnelJobId}
                  onChange={(e) => setFunnelJobId(e.target.value)}
                >
                  {(jobsListData?.jobs ?? []).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mb-3 text-sm text-white/65">No open jobs to chart yet.</p>
            )}
            {funnelJobId && funnelLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full max-w-xl" />
                <Skeleton className="h-10 w-full max-w-lg" />
              </div>
            ) : funnelData?.funnel ? (
              (() => {
                const b = funnelData.funnel.byStatus;
                const row = (label: string, key: string) => (
                  <div
                    key={key}
                    className="min-w-[6rem] rounded-md border border-[var(--border)]/80 bg-[var(--bg-elevated)]/80 px-3 py-2 text-center"
                  >
                    <p className="text-lg font-semibold text-[var(--text)]">
                      {(b[key] ?? 0).toLocaleString()}
                    </p>
                    <p className="text-[0.7rem] uppercase tracking-wide text-white/65">{label}</p>
                  </div>
                );
                return (
                  <div className="space-y-2">
                    <p className="text-sm text-white/65">
                      Total applications:{" "}
                      <span className="font-medium text-[var(--text)]">
                        {funnelData.funnel.total.toLocaleString()}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {row("Applied", "applied")}
                      {row("Viewed", "viewed")}
                      {row("Shortlisted", "shortlisted")}
                      {row("Hired", "hired")}
                      {row("Rejected", "rejected")}
                      {row("Withdrawn", "withdrawn")}
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <section className="card-lifted p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="heading-section text-sm text-[var(--text)]">Coming up next</h2>
                <Calendar size={16} className="text-[var(--accent)]" />
              </div>
              {upcomingInterviews.length === 0 ? (
                <p className="text-body text-sm text-white/65">No upcoming interviews scheduled.</p>
              ) : (
                <ul className="space-y-2">
                  {upcomingInterviews.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[var(--text)]">{item.jobTitle}</p>
                      <p className="text-xs text-white/65">
                        {item.candidateName ?? "Candidate"} ·{" "}
                        {new Date(item.interviewScheduledAt ?? "").toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card-lifted p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="heading-section text-sm text-[var(--text)]">Pending feedback</h2>
                <MessageSquare size={16} className="text-[var(--accent)]" />
              </div>
              <p className="mb-3 text-xs text-white/45">
                {pendingFeedbackCount} interviews waiting for outcome updates
              </p>
              {pendingFeedbackCount === 0 ? (
                <p className="text-body text-sm text-white/65">
                  All interview outcomes are up to date.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingFeedbackPreview.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[var(--text)]">{item.jobTitle}</p>
                      <p className="text-xs text-white/65">
                        Interviewed{" "}
                        {new Date(item.interviewScheduledAt ?? "").toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {pendingFeedbackCount > 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/recruit/pipeline?focus=needs-feedback")}
                  className="mt-3 text-xs font-medium text-[var(--accent)] transition hover:underline"
                >
                  Review in pipeline
                </button>
              )}
            </section>

            <section className="card-lifted p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="heading-section text-sm text-[var(--text)]">Recently worked on</h2>
                <Activity size={16} className="text-[var(--accent)]" />
              </div>
              {recentActivity.length === 0 ? (
                <p className="text-body text-sm text-white/65">No recent activity yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentActivity.map((row, index) => (
                    <li
                      key={`${row.event_type}-${row.event_at}-${index}`}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                        {row.event_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm text-[var(--text)]">{row.event_detail}</p>
                      {row.job_title && (
                        <p className="text-xs text-white/60">Role: {row.job_title}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            <div className="card-lifted p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="heading-section text-sm text-[var(--text)]">Top Candidates</h2>
                <button
                  type="button"
                  onClick={() => router.push("/recruit/candidates")}
                  className="text-sm font-medium text-[var(--accent)] transition hover:underline"
                >
                  View all
                </button>
              </div>
              {candidates.length === 0 ? (
                cLoading ? (
                  <p className="text-body text-sm text-white/65">Loading top candidates...</p>
                ) : (
                  <p className="text-body text-sm text-white/65">No candidates in the pool yet.</p>
                )
              ) : (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      onClick={() => router.push(`/recruit/candidates/${candidate.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
