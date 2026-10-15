"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Calendar,
  Globe,
  Loader2,
  Copy,
  Share2,
  Check,
  Pencil,
  Upload,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";
import { BRAND } from "@/lib/brand";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { getJobLifecycleTone } from "@/lib/status-tones";
import { mapDbJobToPosting, mapDbFitScoreToView } from "@/lib/mappers";
import { copyToClipboard } from "@/lib/utils/clipboard";
import type { JobPosting, JdSectionsView } from "@/types";
import { ShareJobButton } from "@/components/dashboard/ShareJobButton";
import { JdBaseSetupStep } from "@/app/(dashboard)/recruit/jobs/[id]/components/JdBaseSetupStep";

function formatSalary(val: number): string {
  return `₹${(val / 100000).toFixed(0)}L`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const JD_SECTION_LABELS: Record<keyof JdSectionsView, string> = {
  designation: "Designation",
  reportingTo: "Reporting To",
  aboutCompany: "About the Company",
  rolesAndResponsibilities: "Responsibilities",
  technicalSkills: "Technical Skills",
  leadershipSkills: "Leadership Skills",
  softSkills: "Soft Skills",
  preferredSkills: "Preferred Skills",
  niceToHave: "Nice to Have",
  benefits: "Benefits",
  educationRequirements: "Education",
  employmentType: "Employment Type",
  experienceRange: "Experience",
  noticePeriod: "Notice Period",
};

/** Skill-list sections render as chips; sentence lists keep bullets. */
const CHIP_SECTION_KEYS = new Set(["technicalSkills", "leadershipSkills", "softSkills"]);

function renderJdSectionValue(value: unknown, sectionKey?: string): React.ReactNode {
  if (
    typeof value === "string" &&
    sectionKey &&
    CHIP_SECTION_KEYS.has(sectionKey) &&
    value.includes(",")
  ) {
    value = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    const short = value.every((v) => String(v).length <= 40);
    if ((sectionKey && CHIP_SECTION_KEYS.has(sectionKey)) || (short && value.length > 2)) {
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <span
              key={i}
              className="rounded-full border border-[var(--border)] bg-white/[0.04] px-2.5 py-1 text-xs text-white/75"
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <ul className="mt-2 space-y-1.5">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-white/60">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{String(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "string" && value.trim()) {
    return (
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text)]">
        {value}
      </p>
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null);
    if (entries.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1.5">
        {entries.map(([k, v]) => (
          <li key={k} className="text-white/60">
            <span className="font-medium text-[var(--text)]">{k}:</span>{" "}
            <span className="break-words">{String(v)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

/** Build shareable plain-text JD for email/WhatsApp with job link and Apply/Refer CTA */
function buildShareableJd(job: JobPosting, jobUrl: string): string {
  const lines: string[] = [];
  const companyName =
    job.companyName?.trim() && job.companyName.trim().length >= 2
      ? job.companyName.trim()
      : "Company";
  lines.push(`*${job.titleNormalised}*`);
  lines.push(companyName);
  lines.push("");
  lines.push(`📍 ${job.location}`);
  lines.push(job.remoteAllowed ? "🌐 Remote allowed" : "🌐 On-site only");
  if (job.salaryMin > 0 || job.salaryMax > 0) {
    lines.push(`💰 ${formatSalary(job.salaryMin)} – ${formatSalary(job.salaryMax)} / year`);
  }
  if (job.skillsRequired.length > 0) {
    lines.push(`Skills: ${job.skillsRequired.join(", ")}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Job Description");
  lines.push("---");
  lines.push("");
  lines.push((job.jdTextRaw || "").trim());
  lines.push("");
  lines.push("Apply or refer someone:");
  lines.push(jobUrl);
  return lines.join("\n");
}

export default function AgencyJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [optimisticClosed, setOptimisticClosed] = useState(false);

  const {
    data: jobData,
    loading,
    error,
    refetch: refetchJob,
  } = useApiQuery<{ job: Record<string, unknown>; orgSlug?: string }>(
    id ? `/api/jobs/${id}` : null,
  );

  const { data: scoresData, refetch: refetchScores } = useApiQuery<{
    scores: Record<string, unknown>[];
  }>(id ? "/api/fit-score" : null, id ? { jobId: id } : undefined);

  const lastScoresRefetchAt = useRef<number>(0);
  const VISIBILITY_REFETCH_THROTTLE_MS = 15_000;
  useEffect(() => {
    if (!id) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastScoresRefetchAt.current < VISIBILITY_REFETCH_THROTTLE_MS) return;
      lastScoresRefetchAt.current = now;
      refetchScores();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, refetchScores]);

  const fitScores = useMemo(
    () =>
      (scoresData?.scores?.map(mapDbFitScoreToView) ?? []).toSorted(
        (a, b) => b.overallScore - a.overallScore,
      ),
    [scoresData],
  );
  const topFitScore = fitScores[0]?.overallScore ?? null;

  const { mutate: closeJob, loading: closing } = useOptimisticMutation<
    { job?: Record<string, unknown> },
    { status: "closed" }
  >(id ? `/api/jobs/${id}` : "", {
    method: "PATCH",
    onMutate: () => {
      setOptimisticClosed(true);
      return () => setOptimisticClosed(false);
    },
    onSuccess: async () => {
      setShowCloseConfirm(false);
      toast({
        title: "Job closed",
        description: "Candidates can no longer apply to this role.",
        tone: "success",
      });
      await refetchJob();
    },
    onError: (err) => {
      toast({
        title: "Couldn't close job",
        description: err.message,
        tone: "error",
      });
    },
  });

  const jobRaw = jobData?.job;
  const job = jobRaw ? mapDbJobToPosting(jobRaw) : null;
  const jdSections = (job?.jdSections as JdSectionsView | undefined) ?? undefined;
  const sectionsEntries = jdSections
    ? (Object.entries(jdSections).filter(
        ([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""),
      ) as [keyof JdSectionsView, string | string[]][])
    : [];

  if (loading) {
    return (
      <>
        <PageHeader title="Loading..." />
        <div className="space-y-4">
          <div className="card-lifted p-6">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="mt-3 h-4 w-1/4" />
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card-lifted p-5">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-3 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (error || !jobRaw) {
    return (
      <>
        <PageHeader title="Job Not Found" />
        <div className="card-lifted flex flex-col items-center justify-center py-20">
          <p className="text-body text-white/60">No job posting found for this ID.</p>
          <button
            type="button"
            onClick={() => router.push("/agency/jobs")}
            className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Back to Jobs
          </button>
        </div>
      </>
    );
  }

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io");
  const jobUrl = `${baseUrl}/j/${id}`;

  async function handleCopyJd() {
    if (!job) return;
    const text = buildShareableJd(job, jobUrl);
    const ok = await copyToClipboard(text);
    setCopied(ok);
    if (ok) {
      toast({
        title: "Copied",
        description: "JD content is ready to share.",
        tone: "success",
      });
    } else {
      toast({
        title: "Copy failed",
        description: "Try again or use the Share action.",
        tone: "error",
      });
    }
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareJd() {
    if (!job) return;
    const text = buildShareableJd(job, jobUrl);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${job.titleNormalised} – ${job.companyName}`,
          text,
          url: jobUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") await handleCopyJd();
      }
    } else {
      await handleCopyJd();
    }
  }

  async function handleCloseJob() {
    if (!id) return;
    await closeJob({ status: "closed" });
  }

  if (!job) return null;
  const isActive = optimisticClosed ? false : job.isActive;

  return (
    <>
      <PageHeader
        title={job.titleNormalised}
        subtitle={job.companyName}
        actions={
          id ? (
            <ShareJobButton
              jobId={id}
              isActive={isActive}
              orgSlug={jobData?.orgSlug}
              jobTitle={job.titleNormalised}
              companyName={job.companyName}
            />
          ) : null
        }
      />
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="card-lifted mx-4 w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">Close this job?</h3>
            <p className="mt-2 text-sm text-white/60">
              This will mark the job as closed, remove it from external job boards, and preserve all
              applications, fit scores, and pipeline history. Candidates will no longer be able to
              apply.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseJob}
                disabled={closing}
                className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {closing && <Loader2 size={14} className="animate-spin" />}
                Yes, close job
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card-lifted p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="heading-card text-xl text-[var(--text)]">{job.titleNormalised}</h1>
            <p className="text-body mt-1 text-sm text-white/60">{job.companyName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {topFitScore != null ? (
              <FitRing score={topFitScore} size={40} showLabel={false} />
            ) : null}
            {isActive && (
              <Link
                href={`/recruit/v2/jobs/${id}/submit`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[var(--accent)]/90"
              >
                <Upload size={14} />
                Submit candidates
              </Link>
            )}
            <Link
              href={`/agency/jobs/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
            >
              <Pencil size={14} />
              Edit
            </Link>
            {isActive && (
              <button
                type="button"
                onClick={() => setShowCloseConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
              >
                <XCircle size={14} />
                Close Job
              </button>
            )}
            <StatusBadge tone={getJobLifecycleTone(isActive)} size="sm">
              {isActive ? "Active" : "Closed"}
            </StatusBadge>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
          <span className="flex items-center gap-1.5">
            <MapPin size={14} className="text-[var(--accent)]" />
            {job.location}
          </span>
          <span className="flex items-center gap-1.5">
            <Globe size={14} className="text-[var(--accent)]" />
            {job.remoteAllowed ? "Remote allowed" : "On-site only"}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar size={14} className="text-[var(--accent)]" />
            Posted <span suppressHydrationWarning>{formatDate(job.postedDate)}</span>
          </span>
        </div>

        {(job.salaryMin > 0 || job.salaryMax > 0) && (
          <div className="mt-4 text-body text-sm text-white/60">
            {formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)} / year
          </div>
        )}

        {job.skillsRequired.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              Required Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {job.skillsRequired.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {job.jdTextRaw || sectionsEntries.length > 0 ? (
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="heading-section text-base text-[var(--text)]">Job Description</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJd}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy for email/WhatsApp"}
                </button>
                <button
                  type="button"
                  onClick={handleShareJd}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                >
                  <Share2 size={14} />
                  Share
                </button>
              </div>
            </div>
            {isActive && (
              <p className="mb-3 text-xs text-white/60">
                Shareable link (Apply / Refer):{" "}
                <a
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {jobUrl}
                </a>
              </p>
            )}
            {/* Structured sections below are parsed from the same text — render the
                raw JD only when parsing produced nothing, else it shows twice. */}
            {job.jdTextRaw && sectionsEntries.length === 0 ? (
              <div className="text-body whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text)]">
                {job.jdTextRaw}
              </div>
            ) : null}
            {sectionsEntries.map(([key, value]) => {
              const content = renderJdSectionValue(value, key);
              if (!content) return null;
              return (
                <section key={key} className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {JD_SECTION_LABELS[key] ?? key}
                  </h3>
                  {content}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>

      <JdBaseSetupStep jobId={id!} variant="agency" scrollAnchorId="ideal-profile-setup" />

      {fitScores.length > 0 && (
        <section className="mt-8">
          <h2 className="heading-section mb-4 text-lg text-[var(--text)]">
            {BRAND.shortlistHeading}
            <span className="ml-2 text-sm font-normal text-white/60">
              ({fitScores.length} candidates)
            </span>
          </h2>
          <div className="space-y-3">
            {fitScores.map((fs) => (
              <FitScoreReasoningPanel
                key={fs.id}
                score={fs}
                compact
                compactOnNavigate={() => router.push(`/agency/candidates/${fs.candidateId}`)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
