"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  MapPin,
  Building2,
  Calendar,
  Briefcase,
  ArrowLeft,
  Wifi,
  DollarSign,
  MessageCircle,
  Share2,
} from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { WHATSAPP_BOT_PHONE } from "@/lib/config/whatsapp";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { buildJobPostingJsonLd } from "@/lib/jobs/job-posting";
import { copyToClipboard } from "@/lib/utils/clipboard";
import {
  PublicJobDescription,
  PublicJobHiringRequestSections,
  renderPublicJdSectionValue,
} from "@/lib/jobs/format-job-description";
import {
  getJdSectionEntries,
  shouldShowHiringRequestSections,
  shouldShowRawJobDescription,
  shouldShowSkillPills,
} from "@/lib/jobs/public-job-display";
import type { JdSectionsView } from "@/types";

const CANDIDATE_ROLES = ["candidate_pro", "candidate_free"] as const;
function isCandidateRole(role: string): boolean {
  return CANDIDATE_ROLES.includes(role as (typeof CANDIDATE_ROLES)[number]);
}

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PublicJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error } = useApiQuery<{
    job: Record<string, unknown>;
  }>(id ? `/api/jobs/${id}/public` : null);

  const isCandidate = user && isCandidateRole(user.role);
  const logoHref = isCandidate ? "/candidate" : "/";
  const backHref = isCandidate ? "/candidate/jobs" : "/jobs";
  const backLabel = isCandidate ? "Back to jobs" : "All jobs";

  if (loading) {
    return (
      <div className="grain relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="relative z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:py-5">
            <TigerHireLogo href={logoHref} variant="dark" size="sm" className="h-7 w-auto" />
            <Link
              href={backHref}
              className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              {backLabel}
            </Link>
          </nav>
        </header>
        <main className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader2 size={36} className="animate-spin text-[var(--accent)]" />
        </main>
      </div>
    );
  }

  const jobRaw = data?.job;
  const orgData = jobRaw
    ? (jobRaw.organisations as { name?: string; slug?: string } | undefined)
    : undefined;
  const organisationSlug = orgData?.slug;

  if (error || !jobRaw) {
    return (
      <div className="grain relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="relative z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:py-5">
            <TigerHireLogo href={logoHref} variant="dark" size="sm" className="h-7 w-auto" />
            <Link
              href={backHref}
              className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              {backLabel}
            </Link>
          </nav>
        </header>
        <main className="relative z-10 mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-[var(--text)]">Job not found</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This job may have been closed or the link is invalid.
          </p>
          <Link
            href={backHref}
            className="mt-6 inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            {isCandidate ? "Back to jobs" : "Go to TigerHire"}
          </Link>
        </main>
      </div>
    );
  }

  const job = mapDbJobToPosting(jobRaw);
  const jdSections = job.jdSections as JdSectionsView | undefined;
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io");
  const applyUrl = organisationSlug ? `${baseUrl}/apply/${organisationSlug}?job=${id}` : null;
  const jobShareUrl = `${baseUrl}/jobs/${id}`;

  async function handleShareJob() {
    const text = `${job.titleNormalised} at ${job.companyName}\n${jobShareUrl}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${job.titleNormalised} – ${job.companyName}`,
          text,
          url: jobShareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    await copyToClipboard(text);
  }

  const sectionsEntries = getJdSectionEntries(jdSections);
  const showRawDescription = shouldShowRawJobDescription(job.jdTextRaw, sectionsEntries);
  const showSkillPills = shouldShowSkillPills(sectionsEntries);
  const showHiringRequestSections = shouldShowHiringRequestSections(
    showRawDescription,
    sectionsEntries,
  );
  const compensationMin = (jobRaw.compensation_min as number) ?? 0;
  const compensationMax = (jobRaw.compensation_max as number) ?? 0;
  const hasCompensation = compensationMin > 0 || compensationMax > 0;
  const showSalary = jobRaw.show_salary === true;

  // Only jobs TigerHire actually owns may carry our JobPosting structured data. It stamps
  // directApply:true + hiringOrganization sameAs tigerhire.io + identifier "TigerHire" — for
  // an aggregated/scraped row (greenhouse/lever/adzuna/jsearch) that is a Google for Jobs
  // policy violation and would compete with the real employer's own posting. Internal rows
  // are source='tigerhire' (tier 'native'); default to owned when source is absent.
  const isOwnedJob = ((jobRaw.source as string | undefined) ?? "tigerhire") === "tigerhire";

  // JobPosting JSON-LD is built by the shared @/lib/jobs/job-posting builder so the public
  // page and the pre-publish distribution gate stay in lock-step (esp. remote → TELECOMMUTE).
  const jobPostingJsonLd = isOwnedJob
    ? buildJobPostingJsonLd({
        id: job.id,
        title: job.titleNormalised,
        description:
          (job.jdSections as { summary?: string } | undefined)?.summary ?? job.jdTextRaw ?? "",
        companyName: job.companyName,
        createdAt: (jobRaw.created_at as string) ?? job.postedDate ?? null,
        employmentType:
          (job.jdSections as { employmentType?: string } | undefined)?.employmentType ?? null,
        location:
          (job.jdSections as { location?: string } | undefined)?.location ?? job.location ?? null,
        locationType: (jobRaw.location_type as string | null) ?? null,
        remoteAllowed: (jobRaw.remote_allowed as boolean | null) ?? null,
        // Pass the job's real geography when the row carries it (jobs.country /
        // jobs.compensation_currency, added by the geo migration and surfaced once the
        // public API selects them). Null-safe: absent columns fall through to the
        // builder's documented India-first defaults (IN / INR / India) — the old
        // hardcoded `country: "IN"` made Gulf/remote-global agency roles impossible
        // to mark up correctly.
        country: (jobRaw.country as string | null | undefined) ?? null,
        currency: (jobRaw.compensation_currency as string | null | undefined) ?? null,
        // Google accepts an ISO-2 code for applicantLocationRequirements.name, so the
        // job's country doubles as the remote applicant-country when present.
        applicantCountry: (jobRaw.country as string | null | undefined) ?? null,
        showSalary,
        compensationMin,
        compensationMax,
      })
    : null;

  return (
    <div className="grain relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {jobPostingJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jobPostingJsonLd }} />
      )}
      <div className="orb -left-20 top-40 z-0 h-[260px] w-[260px] bg-amber-500/25" aria-hidden />

      <header className="relative z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:py-5">
          <TigerHireLogo href={logoHref} variant="dark" size="sm" className="h-7 w-auto" />
          <Link
            href={backHref}
            className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            {backLabel}
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:py-14">
        {/* Header area */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            {job.companyName}
          </p>
          <h1 className="heading-page mt-1 text-3xl tracking-tight text-[var(--text)] md:text-4xl">
            {job.titleNormalised}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <Building2 size={16} className="shrink-0 text-[var(--accent)]" />
              {job.companyName}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={16} className="shrink-0 text-[var(--accent)]" />
              {job.location}
            </span>
            {job.remoteAllowed && (
              <span className="flex items-center gap-1.5">
                <Wifi size={16} className="shrink-0 text-[var(--accent)]" />
                Remote allowed
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar size={16} className="shrink-0 text-[var(--accent)]" />
              Posted {formatDate(job.postedDate)}
            </span>
          </div>
        </div>

        {/* Apply CTA */}
        {organisationSlug && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <Link
              href={`/apply/${organisationSlug}?job=${id}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <Briefcase size={18} />
              Apply for this job
            </Link>
            <a
              href={`https://wa.me/${WHATSAPP_BOT_PHONE}?text=${encodeURIComponent(`Hi, I'm interested in the ${job.titleNormalised} role at ${job.companyName}. I'd like to drop my CV.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-6 py-3 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
            >
              <MessageCircle size={18} className="shrink-0" aria-hidden />
              Apply via WhatsApp
            </a>
            <button
              type="button"
              onClick={() => void handleShareJob()}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
            >
              <Share2 size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
              Share job
            </button>
          </div>
        )}

        {/* Main content card */}
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 md:p-8 backdrop-blur-sm">
          {/* Quick info pills */}
          <div className="mb-8 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
              {job.seniorityLevel}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
              {job.roleFunction}
            </span>
            {hasCompensation && (
              <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
                <DollarSign size={12} />
                {compensationMin > 0 && compensationMax > 0
                  ? `${CURRENCY.format(compensationMin)} – ${CURRENCY.format(compensationMax)}`
                  : compensationMin > 0
                    ? `${CURRENCY.format(compensationMin)}+`
                    : `Up to ${CURRENCY.format(compensationMax)}`}
              </span>
            )}
            {job.remoteAllowed && (
              <span className="rounded-full bg-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
                Remote
              </span>
            )}
          </div>

          {/* Job Description */}
          {showRawDescription && (
            <section className="mb-8">
              <h2 className="text-base font-semibold text-white">About the role</h2>
              <div className="mt-4">
                <PublicJobDescription text={job.jdTextRaw} />
              </div>
            </section>
          )}

          {showHiringRequestSections && <PublicJobHiringRequestSections jobRaw={jobRaw} />}

          {/* JD Sections */}
          {sectionsEntries.map(([key, value]) => {
            const label = JD_SECTION_LABELS[key] ?? key;
            const content = renderPublicJdSectionValue(value, key);
            if (!content) return null;
            return (
              <section key={key} className="mb-8">
                <h2 className="text-base font-semibold text-white">{label}</h2>
                <div className="mt-4">{content}</div>
              </section>
            );
          })}

          {/* Skills Required */}
          {showSkillPills && job.skillsRequired.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Skills required
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.skillsRequired.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-[var(--accent-muted)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Skills Preferred */}
          {showSkillPills && job.skillsPreferred.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Skills preferred
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.skillsPreferred.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}
        </article>

        <div className="mt-10 flex flex-col gap-6 border-t border-[var(--border)] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />
            {isCandidate ? "Back to jobs" : "Back to TigerHire"}
          </Link>
          {organisationSlug && (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/apply/${organisationSlug}?job=${id}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <Briefcase size={18} />
                Apply for this job
              </Link>
              <a
                href={`https://wa.me/${WHATSAPP_BOT_PHONE}?text=${encodeURIComponent(`Hi, I'm interested in the ${job.titleNormalised} role at ${job.companyName}. I'd like to drop my CV.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-6 py-3 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
              >
                <MessageCircle size={18} className="shrink-0" aria-hidden />
                Apply via WhatsApp
              </a>
              <button
                type="button"
                onClick={() => void handleShareJob()}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
              >
                <Share2 size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
                Share job
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
