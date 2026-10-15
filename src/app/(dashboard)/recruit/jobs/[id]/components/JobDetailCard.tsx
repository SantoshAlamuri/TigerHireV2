"use client";

import { MapPin, Calendar, Globe, Users, Copy, Share2, Check, Link2 } from "lucide-react";
import type { JobPosting, JdSectionsView } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getJobLifecycleTone } from "@/lib/status-tones";
import { RecruiterAssignment } from "./RecruiterAssignment";
import { formatSalary, formatDate } from "./job-detail-utils";

export function JobDetailCard({
  job,
  jobRaw,
  jobId,
  jobUrl,
  applyUrl,
  copied,
  applyLinkCopied,
  onCopyJd,
  onShareJd,
  onCopyApplyLink,
}: {
  job: JobPosting;
  jobRaw: Record<string, unknown>;
  jobId: string;
  jobUrl: string;
  applyUrl: string | null;
  copied: boolean;
  applyLinkCopied: boolean;
  onCopyJd: () => void;
  onShareJd: () => void;
  onCopyApplyLink: () => void;
}) {
  const assignedRecruiterId = jobRaw?.assigned_recruiter_id as string | null;
  const jdSections = job.jdSections as JdSectionsView | undefined;
  const sectionsEntries = jdSections
    ? (Object.entries(jdSections).filter(
        ([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""),
      ) as [keyof JdSectionsView, string | string[]][])
    : [];
  const sectionLabels: Record<keyof JdSectionsView, string> = {
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
  const renderSectionValue = (value: unknown): React.ReactNode => {
    if (Array.isArray(value)) {
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
        <p className="mt-2 whitespace-pre-line break-words text-[var(--text)] leading-relaxed">
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
  };
  return (
    <div className="card-lifted p-6 backdrop-blur-md md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="heading-card text-xl text-[var(--text)]">{job.titleNormalised}</h1>
          <p className="text-body mt-1 text-sm text-white/60">{job.companyName}</p>
        </div>
        <StatusBadge tone={getJobLifecycleTone(job.isActive)} size="sm">
          {job.isActive ? "Active" : "Closed"}
        </StatusBadge>
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
        <span className="flex items-center gap-1.5">
          <Users size={14} className="text-[var(--accent)]" />
          {job.matchedCandidatesCount} matched
        </span>
      </div>

      {(job.salaryMin > 0 || job.salaryMax > 0) && (
        <div className="mt-4 text-body text-sm text-white/60">
          {formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)} / year
        </div>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Assigned Recruiter
        </p>
        <RecruiterAssignment
          jobId={jobId}
          currentRecruiterId={assignedRecruiterId}
          onAssigned={() => window.location.reload()}
        />
      </div>

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
                onClick={onCopyJd}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy for email/WhatsApp"}
              </button>
              <button
                type="button"
                onClick={onShareJd}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
          </div>
          {job.isActive && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-white/60">
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
              {applyUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2">
                  <Link2 size={14} className="shrink-0 text-[var(--accent)]" />
                  <p className="min-w-0 flex-1 text-xs text-white/60">
                    <span className="font-medium text-[var(--text)]">Apply Link</span>
                    {" — paste on LinkedIn, Indeed, Naukri, or anywhere: "}
                    <a
                      href={applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-[var(--accent)] hover:underline"
                    >
                      {applyUrl}
                    </a>
                  </p>
                  <button
                    type="button"
                    onClick={onCopyApplyLink}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                  >
                    {applyLinkCopied ? <Check size={12} /> : <Copy size={12} />}
                    {applyLinkCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Structured sections below are parsed from the same text — render the
              raw JD only when parsing produced nothing, else it shows twice. */}
          {job.jdTextRaw && sectionsEntries.length === 0 ? (
            <div className="text-body whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text)]">
              {job.jdTextRaw}
            </div>
          ) : null}
          {sectionsEntries.map(([key, value]) => {
            const content = renderSectionValue(value);
            if (!content) return null;
            return (
              <section key={key} className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  {sectionLabels[key] ?? key}
                </h3>
                {content}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
