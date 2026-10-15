"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Briefcase,
  MapPin,
  Wifi,
  Share2,
  ChevronRight,
  Heart,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { BRAND } from "@/lib/brand";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import type { JobPosting } from "@/types";
import { JobReferralBonusBadge } from "@/components/jobs/JobReferralBonusBadge";

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatSalary(min: number, max: number): string {
  if (min === 0 && max === 0) return "Not disclosed";
  if (min === max) return CURRENCY.format(min);
  return `${CURRENCY.format(min)} – ${CURRENCY.format(max)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function companyDisplayName(raw: string): { text: string; isPlaceholder: boolean } {
  const t = raw.trim();
  if (!t || /^unknown$/i.test(t)) {
    return { text: "Employer", isPlaceholder: true };
  }
  return { text: t, isPlaceholder: false };
}

function JobBrowseCard({
  job,
  fitScore,
  fitScoreId,
  alreadyApplied,
  onApply,
  onShare,
}: {
  job: JobPosting;
  fitScore: number;
  fitScoreId: string;
  alreadyApplied: boolean;
  onApply: (args: {
    jobId: string;
    fitScoreId: string;
    jobTitle: string;
    companyName: string;
  }) => void;
  onShare: (job: JobPosting) => void;
}) {
  const skills = job.skillsRequired?.slice(0, 5) ?? [];
  const company = companyDisplayName(job.companyName);

  return (
    <div className="card-lifted card-lifted-hover flex h-full flex-col shadow-sm">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onShare(job);
          }}
          className="absolute right-4 top-4 z-10 rounded-md border border-transparent p-2 text-white/65 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
          aria-label="Share or copy link to this job"
        >
          <Share2 size={17} strokeWidth={1.75} />
        </button>
        <Link
          href={`/jobs/${job.id}`}
          className="group flex min-h-0 flex-1 flex-col p-5 pr-14 pb-4"
        >
          <div className="flex items-start gap-3">
            <span
              className={
                company.isPlaceholder
                  ? "inline-flex max-w-full truncate rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/55 ring-1 ring-inset ring-white/[0.06]"
                  : "inline-flex max-w-full truncate rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/65"
              }
              title={company.isPlaceholder ? undefined : company.text}
            >
              {company.text}
            </span>
          </div>

          <h3 className="heading-card mt-3 line-clamp-2 text-lg font-semibold leading-snug text-white group-hover:text-white">
            {job.titleNormalised}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FitRing score={fitScore} size={40} />
            <span className="text-[11px] text-white/45">
              Your match · full breakdown in {BRAND.candidateScoresNav}.
            </span>
          </div>

          <JobReferralBonusBadge job={job} />

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/65">
            {job.location ? (
              <span className="inline-flex max-w-full items-center gap-1">
                <MapPin size={14} className="shrink-0 opacity-80" aria-hidden />
                <span className="truncate">{job.location}</span>
              </span>
            ) : null}
            {job.location && (job.remoteAllowed || job.postedDate) ? (
              <span className="text-white/45" aria-hidden>
                ·
              </span>
            ) : null}
            {job.remoteAllowed ? (
              <span className="inline-flex items-center gap-1 font-medium text-cyan-600 dark:text-cyan-400">
                <Wifi size={14} aria-hidden />
                Remote
              </span>
            ) : null}
            {job.remoteAllowed && job.postedDate ? (
              <span className="text-white/45" aria-hidden>
                ·
              </span>
            ) : null}
            {job.postedDate ? (
              <span className="whitespace-nowrap">Posted {formatDate(job.postedDate)}</span>
            ) : null}
          </div>

          <div className="mt-4 min-h-[2.25rem] flex-1">
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] font-medium text-white/80"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-4">
            <span className="text-body text-base font-semibold tabular-nums text-white">
              {formatSalary(job.salaryMin, job.salaryMax)}
            </span>
            <span className="text-body inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-white/65">
              View role
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            </span>
          </div>
        </Link>
        <div className="px-5 pb-4">
          {alreadyApplied ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              <CheckCircle2 size={12} />
              Applied
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                onApply({
                  jobId: job.id,
                  fitScoreId,
                  jobTitle: job.titleNormalised,
                  companyName: company.text,
                })
              }
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
            >
              <Heart size={13} />
              I&apos;m Interested
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CandidateJobsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [localAppliedIds, setLocalAppliedIds] = useState<Set<string>>(new Set());
  const limit = 12;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      open_only: true,
      page,
      limit,
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [page, limit, debouncedSearch]);

  const { data, loading } = useApiQuery<{
    matches: Record<string, unknown>[];
    pagination?: { page: number; limit: number; total: number; totalPages: number };
    message?: string;
  }>("/api/candidates/matches", queryParams);
  const { data: appsData } = useApiQuery<{
    applications: { job_id: string }[];
  }>("/api/applications", { limit: 200 });
  const appliedJobIds = useMemo(() => {
    const ids = new Set(localAppliedIds);
    appsData?.applications?.forEach((app) => ids.add(app.job_id));
    return ids;
  }, [appsData, localAppliedIds]);
  const { mutate: applyToJob } = useOptimisticMutation<
    Record<string, unknown>,
    {
      jobId: string;
      fitScoreId: string;
      interest: "interested";
      jobTitle: string;
      companyName: string;
    }
  >("/api/applications", {
    onMutate: (variables) => {
      setLocalAppliedIds((prev) => new Set(prev).add(variables.jobId));
      return () => {
        setLocalAppliedIds((prev) => {
          const next = new Set(prev);
          next.delete(variables.jobId);
          return next;
        });
      };
    },
    onSuccess: (_response, variables) => {
      toast({
        title: "Application sent",
        description: `${variables.jobTitle} at ${variables.companyName}`,
        tone: "success",
      });
    },
    onError: (error, variables) => {
      toast({
        title: "Couldn't send application",
        description: error.message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void handleApply(variables);
          },
        },
      });
    },
  });

  const jobsWithScores = useMemo(() => {
    const rows = data?.matches ?? [];
    const out: { job: JobPosting; fitScore: number; fitScoreId: string }[] = [];
    for (const m of rows) {
      const jobs = m.jobs as Record<string, unknown> | null | undefined;
      if (!jobs || typeof jobs.id !== "string") continue;
      const overall = m.overall_score;
      const fitScore = typeof overall === "number" ? overall : 0;
      const fitScoreId = typeof m.id === "string" ? m.id : jobs.id;
      out.push({ job: mapDbJobToPosting(jobs), fitScore, fitScoreId });
    }
    return out;
  }, [data?.matches]);

  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total ?? 0;
  const profileHint =
    typeof data?.message === "string" && data.message.toLowerCase().includes("profile");
  const handleApply = useCallback(
    async (variables: {
      jobId: string;
      fitScoreId: string;
      interest: "interested";
      jobTitle: string;
      companyName: string;
    }) => {
      await applyToJob(variables);
    },
    [applyToJob],
  );

  const handleShare = useCallback(async (job: JobPosting) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/jobs/${job.id}`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: job.titleNormalised,
          text: `Role: ${job.titleNormalised}`,
          url,
        });
        setShareHint("Shared from your device.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareHint("Public job link copied.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareHint("Public job link copied.");
      } catch {
        setShareHint("Could not copy link.");
      }
    }
    window.setTimeout(() => setShareHint(null), 2800);
  }, []);

  return (
    <>
      <PageHeader
        title="Browse Jobs"
        subtitle={`Open roles scored against your profile — best match first. For ${BRAND.score} details, use ${BRAND.candidateScoresNav}.`}
      />
      <p className="text-body mb-4 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">
        Know someone who fits?{" "}
        <Link
          href="/dashboard/referrer"
          className="font-semibold text-[var(--accent)] hover:underline"
        >
          Refer &amp; earn
        </Link>{" "}
        uses your referrer links (set up once there). Cards here use a simple public link when you
        share.
      </p>

      <div className="mb-6">
        <label htmlFor="job-search" className="sr-only">
          Search jobs
        </label>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/65"
            aria-hidden
          />
          <input
            id="job-search"
            type="search"
            placeholder="Search your matched roles…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
            aria-label="Search matched jobs"
          />
        </div>
        {shareHint ? (
          <p className="mt-2 text-sm text-white/65" role="status" aria-live="polite">
            {shareHint}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="card-lifted p-5">
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-lifted p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-3 h-3 w-1/2" />
                <Skeleton className="mt-5 h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : jobsWithScores.length === 0 ? (
        <div className="card-lifted px-6 py-16 text-center">
          <Briefcase size={48} className="mx-auto mb-4 text-white/45" aria-hidden />
          {profileHint ? (
            <>
              <p className="text-body mx-auto max-w-md text-white/65">{data?.message}</p>
              <Link
                href="/candidate/profile"
                className="mt-4 inline-flex font-semibold text-[var(--accent)] hover:underline"
              >
                Complete your profile
              </Link>
            </>
          ) : (
            <>
              <p className="text-body mx-auto max-w-md text-white/65">
                {debouncedSearch.trim()
                  ? "No matched open roles fit that search. Try other keywords or clear the filter."
                  : "No open roles are matched to your profile yet. Update your CV or check back as new jobs go live."}
              </p>
              {!debouncedSearch.trim() ? (
                <p className="mt-4 text-sm text-white/65">
                  Want to explore everything?{" "}
                  <Link href="/jobs" className="font-medium text-[var(--accent)] hover:underline">
                    View all public listings
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-body mb-4 text-sm text-white/65">
            {total} matched {total === 1 ? "role" : "roles"}
            {debouncedSearch.trim() ? " (filtered)" : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobsWithScores.map(({ job, fitScore, fitScoreId }) => (
              <JobBrowseCard
                key={job.id}
                job={job}
                fitScore={fitScore}
                fitScoreId={fitScoreId}
                alreadyApplied={appliedJobIds.has(job.id)}
                onApply={(args) =>
                  void handleApply({
                    ...args,
                    interest: "interested",
                  })
                }
                onShare={handleShare}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-body px-4 text-sm text-white/65">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
