"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Globe,
  Calendar,
  Loader2,
  Briefcase,
  Share2,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";
import { WHATSAPP_BOT_PHONE } from "@/lib/config/whatsapp";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import { copyToClipboard as copyTextToClipboard } from "@/lib/utils/clipboard";
import { buildLinkedInShareUrl } from "@/lib/jobs/job-share-urls";
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

function getJobUrl(id: string): string {
  if (typeof window !== "undefined") return `${window.location.origin}/j/${id}`;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io"}/j/${id}`;
}

export default function PublicJobPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApiQuery<{
    job: Record<string, unknown>;
  }>(id ? `/api/jobs/${id}/public` : null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Login
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex justify-center">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
          </div>
        </main>
      </div>
    );
  }

  const jobRaw = data?.job;
  if (error || !jobRaw) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Login
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-[var(--text)]">Job not found</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This job may have been closed or the link is invalid.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
          >
            Go to TigerHire
          </Link>
        </main>
      </div>
    );
  }

  const job = mapDbJobToPosting(jobRaw);
  const jdSections = job.jdSections as JdSectionsView | undefined;
  const sectionsEntries = getJdSectionEntries(jdSections);
  const showRawDescription = shouldShowRawJobDescription(job.jdTextRaw, sectionsEntries);
  const showSkillPills = shouldShowSkillPills(sectionsEntries);
  const showHiringRequestSections = shouldShowHiringRequestSections(
    showRawDescription,
    sectionsEntries,
  );
  const jobLink = getJobUrl(job.id);
  const orgSlug = (jobRaw as { organisations?: { slug?: string } })?.organisations?.slug;
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io");
  const applyUrl = orgSlug && id ? `${baseUrl}/apply/${orgSlug}?job=${id}` : null;

  async function handleShare() {
    const text = `${job.titleNormalised} at ${job.companyName}\n${jobLink}\n\nApply or refer someone: ${jobLink}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${job.titleNormalised} – ${job.companyName}`,
          text,
          url: jobLink,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") await copyTextToClipboard(text);
      }
    } else {
      await copyTextToClipboard(text);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
          <div className="flex items-center gap-4">
            <Link
              href="/contact"
              className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              For employers
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 pb-16">
        {/* Job card */}
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 shadow-sm backdrop-blur-sm md:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              {job.companyName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">
              {job.titleNormalised}
            </h1>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <MapPin size={16} className="shrink-0 text-[var(--accent)]" />
              {job.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Globe size={16} className="shrink-0 text-[var(--accent)]" />
              {job.remoteAllowed ? "Remote allowed" : "On-site"}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={16} className="shrink-0 text-[var(--accent)]" />
              Posted {formatDate(job.postedDate)}
            </span>
          </div>

          {(job.salaryMin > 0 || job.salaryMax > 0) && (
            <p className="mt-3 text-sm font-medium text-[var(--text)]">
              {formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)} / year
            </p>
          )}

          {/* CTAs — world-class placement */}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-6">
            {applyUrl ? (
              <Link
                href={applyUrl}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--glow)]"
              >
                <Briefcase size={18} />
                Apply for this job
              </Link>
            ) : (
              <Link
                href={`/login?redirect=${encodeURIComponent(`/j/${id}`)}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)]"
              >
                <Briefcase size={18} />
                Login to apply
              </Link>
            )}
            <a
              href={`https://wa.me/${WHATSAPP_BOT_PHONE}?text=${encodeURIComponent(`Hi, I'm interested in the ${job.titleNormalised} role at ${job.companyName}. I'd like to drop my CV.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-5 py-3 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
            >
              <MessageCircle size={18} className="shrink-0" aria-hidden />
              Apply via WhatsApp
            </a>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              <Share2 size={18} />
              Share job
            </button>
            <a
              href={buildLinkedInShareUrl(jobLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[#0A66C2]/40 bg-[#0A66C2]/10 px-5 py-3 text-sm font-semibold text-[#7CB8FF] transition hover:bg-[#0A66C2]/20"
            >
              <ExternalLink size={16} aria-hidden />
              LinkedIn
            </a>
          </div>

          {showSkillPills && job.skillsRequired.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Required skills
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.skillsRequired.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-[var(--accent-muted)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showRawDescription && (
            <div className="mt-8 border-t border-[var(--border)] pt-6">
              <h2 className="text-base font-semibold text-white">About the role</h2>
              <div className="mt-4">
                <PublicJobDescription text={job.jdTextRaw} />
              </div>
            </div>
          )}

          {showHiringRequestSections && <PublicJobHiringRequestSections jobRaw={jobRaw} />}

          {sectionsEntries.map(([key, value]) => {
            const label = JD_SECTION_LABELS[key] ?? key;
            const content = renderPublicJdSectionValue(value, key);
            if (!content) return null;
            return (
              <section key={key} className="mt-8 border-t border-[var(--border)] pt-6">
                <h2 className="text-base font-semibold text-white">{label}</h2>
                <div className="mt-4">{content}</div>
              </section>
            );
          })}
        </article>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-8">
          {applyUrl ? (
            <Link
              href={applyUrl}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--glow)]"
            >
              <Briefcase size={18} />
              Apply for this job
            </Link>
          ) : (
            <Link
              href={`/login?redirect=${encodeURIComponent(`/j/${id}`)}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)]"
            >
              <Briefcase size={18} />
              Login to apply
            </Link>
          )}
          <a
            href={`https://wa.me/${WHATSAPP_BOT_PHONE}?text=${encodeURIComponent(`Hi, I'm interested in the ${job.titleNormalised} role at ${job.companyName}. I'd like to drop my CV.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-5 py-3 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/25"
          >
            <MessageCircle size={18} className="shrink-0" aria-hidden />
            Apply via WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <Share2 size={18} />
            Share job
          </button>
          <a
            href={buildLinkedInShareUrl(jobLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#0A66C2]/40 bg-[#0A66C2]/10 px-5 py-3 text-sm font-semibold text-[#7CB8FF] transition hover:bg-[#0A66C2]/20"
          >
            <ExternalLink size={16} aria-hidden />
            LinkedIn
          </a>
        </div>

        <p className="mt-12 text-center text-xs text-[var(--text-subtle)]">
          Powered by{" "}
          <Link href="/" className="font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            {SITE_MARKETING.brand}
          </Link>{" "}
          — {SITE_MARKETING.tagline}
        </p>
      </main>
    </div>
  );
}
