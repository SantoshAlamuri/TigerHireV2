"use client";

import { MapPin, Building2, ExternalLink, Wifi } from "lucide-react";
import type { JobPosting } from "@/types";
import { JobReferralBonusBadge } from "@/components/jobs/JobReferralBonusBadge";

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatSalary(min: number, max: number, show: boolean): string {
  if (!show) return "Salary not disclosed";
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

export function PublicJobCardBody({ job, showSalary }: { job: JobPosting; showSalary: boolean }) {
  const skills = job.skillsRequired?.slice(0, 4) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="heading-card truncate text-base text-white group-hover:text-[var(--accent)]">
            {job.titleNormalised}
          </h3>
          <JobReferralBonusBadge job={job} />
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/55">
            <Building2 size={14} className="shrink-0" aria-hidden />
            {job.companyName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-white/55 transition group-hover:text-[var(--accent)]">
            <ExternalLink size={16} aria-hidden />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin size={14} aria-hidden />
            {job.location}
          </span>
        )}
        {job.remoteAllowed && (
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <Wifi size={14} aria-hidden />
            Remote
          </span>
        )}
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs text-white/55"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-sm font-medium text-white">
          {formatSalary(job.salaryMin, job.salaryMax, showSalary)}
        </span>
        <span className="text-xs text-white/45">Posted {formatDate(job.postedDate)}</span>
      </div>
    </div>
  );
}
