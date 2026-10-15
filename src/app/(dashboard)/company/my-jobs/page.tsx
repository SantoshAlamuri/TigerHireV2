"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Users,
  TrendingUp,
  CheckSquare,
  GitPullRequest,
  ClipboardList,
  ArrowRight,
  Briefcase,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import JobsTable from "@/components/dashboard/JobsTable";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { filterPillClass } from "@/components/ui/filter-pill";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import type { ApprovalTaskItem } from "@/lib/approvals/task-types";

type TabFilter = "all" | "active" | "closed";
type OfferStatusFilter = "all" | "pending" | "sent" | "accepted" | "closed";

const TABS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
];

const REPORT_CARD_CLASS =
  "card-lifted p-4 transition-colors duration-200 hover:border-[var(--accent)]/20 hover:bg-white/[0.04]";
const REPORT_ITEM_CLASS =
  "card-lifted p-3 transition-colors duration-150 hover:border-[var(--accent)]/20 hover:bg-white/[0.04]";

export default function MyJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabFromQuery = searchParams.get("tab");
  const initialTab: TabFilter =
    tabFromQuery === "active" || tabFromQuery === "closed" || tabFromQuery === "all"
      ? tabFromQuery
      : "all";
  const [tab, setTab] = useState<TabFilter>(initialTab);

  useEffect(() => {
    const nextTab: TabFilter =
      tabFromQuery === "active" || tabFromQuery === "closed" || tabFromQuery === "all"
        ? tabFromQuery
        : "all";
    if (nextTab !== tab) setTab(nextTab);
  }, [tabFromQuery, tab]);

  const offerStatusFromQuery = searchParams.get("offerStatus");
  const offerStatusFilter: OfferStatusFilter =
    offerStatusFromQuery === "pending" ||
    offerStatusFromQuery === "sent" ||
    offerStatusFromQuery === "accepted" ||
    offerStatusFromQuery === "closed" ||
    offerStatusFromQuery === "all"
      ? offerStatusFromQuery
      : "all";

  const statusParam = tab === "active" ? "open" : tab === "closed" ? "closed" : undefined;
  const { data, loading, error } = useApiQuery<{
    jobs: Record<string, unknown>[];
    pagination: { total: number };
  }>("/api/jobs", statusParam ? { status: statusParam } : undefined);

  const { data: approvalsData } = useApiQuery<{
    pendingApprovals: { id: string }[];
    items?: ApprovalTaskItem[];
  }>("/api/approvals");

  const { data: pipelineData } = useApiQuery<{
    pipeline: { id: string; status: string }[];
  }>("/api/my-pipeline");

  const { data: hiringRequestsData } = useApiQuery<{
    requests: { id: string; status: string }[];
  }>("/api/hiring-requests");
  const { data: offersData } = useApiQuery<{
    offers: Array<{
      status?: string | null;
      applications?:
        | {
            job_id?: string | null;
          }
        | Array<{
            job_id?: string | null;
          }>
        | null;
    }>;
  }>("/api/offers");

  const jobs = data?.jobs?.map(mapDbJobToPosting) ?? [];
  const activeJobs = jobs.filter((j) => j.isActive);
  const pendingApprovals =
    approvalsData?.items?.length ?? approvalsData?.pendingApprovals?.length ?? 0;
  const pipelineCandidates = pipelineData?.pipeline?.length ?? 0;
  const hiredCandidates = pipelineData?.pipeline?.filter((p) => p.status === "hired").length ?? 0;
  const pendingRequests =
    hiringRequestsData?.requests?.filter((r) =>
      ["submitted", "under_review", "draft"].includes(String(r.status)),
    ).length ?? 0;

  const offers = offersData?.offers ?? [];
  const jobOfferStatusCounts = new Map<
    string,
    { total: number; sent: number; accepted: number; pending: number; closed: number }
  >();
  let hmSentOffers = 0;
  let hmAcceptedOffers = 0;
  let hmPendingOffers = 0;
  let hmDeclinedOffers = 0;
  for (const offer of offers) {
    const app = Array.isArray(offer.applications) ? offer.applications[0] : offer.applications;
    const jobId = (app?.job_id ?? "").trim();
    if (!jobId) continue;
    const status = String(offer.status ?? "");
    const current = jobOfferStatusCounts.get(jobId) ?? {
      total: 0,
      sent: 0,
      accepted: 0,
      pending: 0,
      closed: 0,
    };
    current.total += 1;
    if (status === "sent") {
      current.sent += 1;
      hmSentOffers += 1;
    }
    if (status === "accepted") {
      current.accepted += 1;
      hmAcceptedOffers += 1;
    }
    if (status === "declined" || status === "withdrawn" || status === "expired") {
      current.closed += 1;
      hmDeclinedOffers += 1;
    }
    if (status === "draft" || status === "pending_admin" || status === "pending_finance") {
      current.pending += 1;
      hmPendingOffers += 1;
    }
    jobOfferStatusCounts.set(jobId, current);
  }

  const jobsForDisplay = jobs.filter((job) => {
    if (offerStatusFilter === "all") return true;
    const counts = jobOfferStatusCounts.get(job.id);
    if (!counts) return false;
    if (offerStatusFilter === "pending") return counts.pending > 0;
    if (offerStatusFilter === "sent") return counts.sent > 0;
    if (offerStatusFilter === "accepted") return counts.accepted > 0;
    return counts.closed > 0;
  });

  function dashboardHref(
    next: Partial<{ tab: TabFilter; offerStatus: OfferStatusFilter }>,
  ): string {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab) params.set("tab", next.tab);
    if (next.offerStatus) params.set("offerStatus", next.offerStatus);
    const qs = params.toString();
    return qs ? `/company/my-jobs?${qs}` : "/company/my-jobs";
  }

  return (
    <>
      <PageHeader
        title="Hiring Manager Dashboard"
        subtitle="Only roles assigned to you are shown. Track job progress and offer status at a glance."
      />
      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-6 w-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Overview stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="My Active Jobs"
              value={activeJobs.length}
              icon={<Briefcase size={20} />}
              href={dashboardHref({ tab: "active" })}
            />
            <StatCard
              label="Pending Approvals"
              value={pendingApprovals}
              icon={<CheckSquare size={20} />}
              href="/company/approvals"
            />
            <StatCard
              label="In Pipeline"
              value={pipelineCandidates}
              icon={<GitPullRequest size={20} />}
              href="/company/my-pipeline"
            />
            <StatCard
              label="Hired"
              value={hiredCandidates}
              icon={<TrendingUp size={20} />}
              href="/company/my-pipeline"
            />
          </div>

          <div className={REPORT_CARD_CLASS}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-white/55" />
                <p className="text-sm font-semibold text-[var(--text)]">Offer Status</p>
              </div>
              <Link
                href={dashboardHref({ offerStatus: "all" })}
                className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Link
                href={dashboardHref({ offerStatus: "pending" })}
                className={`${REPORT_ITEM_CLASS} ${
                  offerStatusFilter === "pending" ? "border-amber-400/40 bg-amber-500/10" : ""
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-amber-300">Pending</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">{hmPendingOffers}</p>
              </Link>
              <Link
                href={dashboardHref({ offerStatus: "sent" })}
                className={`${REPORT_ITEM_CLASS} ${
                  offerStatusFilter === "sent" ? "border-blue-400/40 bg-blue-500/10" : ""
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-blue-300">Sent</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">{hmSentOffers}</p>
              </Link>
              <Link
                href={dashboardHref({ offerStatus: "accepted" })}
                className={`${REPORT_ITEM_CLASS} ${
                  offerStatusFilter === "accepted" ? "border-emerald-400/40 bg-emerald-500/10" : ""
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-emerald-300">Accepted</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">{hmAcceptedOffers}</p>
              </Link>
              <Link
                href={dashboardHref({ offerStatus: "closed" })}
                className={`${REPORT_ITEM_CLASS} ${
                  offerStatusFilter === "closed" ? "border-zinc-400/40 bg-zinc-500/10" : ""
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-zinc-300">Closed</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">{hmDeclinedOffers}</p>
              </Link>
            </div>
            <p className="mt-3 text-xs text-white/60">
              Showing{" "}
              {offerStatusFilter === "all"
                ? "all offer records"
                : `${offerStatusFilter} offer records`}{" "}
              for your assigned roles.
            </p>
          </div>

          {/* Quick actions */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingApprovals > 0 && (
              <Link
                href="/company/approvals"
                className={`${REPORT_ITEM_CLASS} flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
                    <CheckSquare size={18} className="text-white/55" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {pendingApprovals} approval{pendingApprovals !== 1 ? "s" : ""} waiting
                    </p>
                    <p className="text-xs text-white/60">Review shortlisted candidates</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-white/60" />
              </Link>
            )}
            {pendingRequests > 0 && (
              <Link
                href="/company/hiring-requests"
                className={`${REPORT_ITEM_CLASS} flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
                    <ClipboardList size={18} className="text-white/55" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {pendingRequests} hiring request{pendingRequests !== 1 ? "s" : ""} pending
                    </p>
                    <p className="text-xs text-white/60">Awaiting review</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-white/60" />
              </Link>
            )}
            <Link
              href="/company/hiring-requests/new"
              className={`${REPORT_ITEM_CLASS} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
                  <ClipboardList size={18} className="text-white/55" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">New Hiring Request</p>
                  <p className="text-xs text-white/60">Request a new role to be filled</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-white/60" />
            </Link>
          </div>

          {/* Jobs section */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="heading-section text-lg text-[var(--text)]">My Jobs</h2>
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <Link
                    key={t.key}
                    href={dashboardHref({ tab: t.key })}
                    className={filterPillClass(tab === t.key)}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            </div>

            {jobs.length === 0 ? (
              <div className="card-lifted flex flex-col items-center justify-center py-16">
                <FileText size={40} className="text-white/60" />
                <p className="text-body mt-4 text-white/60">No jobs assigned to you yet</p>
                <p className="text-body mt-1 text-sm text-white/60">
                  Your company admin or recruiter can assign you as the hiring manager when they
                  create or edit a JD.
                </p>
                <Link
                  href="/company/hiring-requests/new"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  <ClipboardList size={16} />
                  Submit a Hiring Request
                </Link>
              </div>
            ) : jobsForDisplay.length === 0 ? (
              <div className="card-lifted flex flex-col items-center justify-center py-16">
                <FileText size={40} className="text-white/60" />
                <p className="text-body mt-4 text-white/60">No jobs match this offer filter</p>
                <p className="text-body mt-1 text-sm text-white/60">
                  Try another Offer Status filter to see related roles.
                </p>
                <Link
                  href={dashboardHref({ offerStatus: "all" })}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                >
                  Reset offer filter
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
                  <TrendingUp size={16} />
                  <span>
                    {jobsForDisplay.length} job{jobsForDisplay.length !== 1 ? "s" : ""} shown
                  </span>
                </div>
                <JobsTable
                  jobs={jobsForDisplay}
                  onRowClick={(id) => router.push(`/company/jobs/${id}`)}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
