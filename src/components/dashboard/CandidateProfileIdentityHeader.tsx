"use client";

import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import { ProfileCompletenessRing } from "@/components/ui/ProfileCompletenessRing";

function isGenericRoleTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === "" || t === "professional";
}

/** Hero strip: name, compact email/phone under name, completeness ring + optional aside. */
export function CandidateProfileIdentityHeader({
  displayName,
  roleTitle,
  profileCompleteness,
  emailDisplay,
  phoneDisplay,
  emailHref,
  phoneHref,
  aside,
  nameRowAside,
}: {
  displayName: string;
  roleTitle: string;
  profileCompleteness: number;
  emailDisplay: string;
  phoneDisplay: string;
  emailHref?: string | null;
  phoneHref?: string | null;
  aside?: ReactNode;
  /** e.g. compact resume link(s) beside the name */
  nameRowAside?: ReactNode;
}) {
  const showRoleLine = !isGenericRoleTitle(roleTitle);

  const emailBody = emailHref ? (
    <a href={emailHref} className="min-w-0 truncate transition-colors hover:text-[var(--accent)]">
      {emailDisplay}
    </a>
  ) : (
    <span className="min-w-0 truncate text-white/60">{emailDisplay}</span>
  );

  const phoneBody = phoneHref ? (
    <a href={phoneHref} className="min-w-0 truncate transition-colors hover:text-[var(--accent)]">
      {phoneDisplay}
    </a>
  ) : (
    <span className="min-w-0 truncate text-white/60">{phoneDisplay}</span>
  );

  return (
    <div className="flex flex-col gap-5 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="heading-card min-w-0 text-2xl font-semibold tracking-tight text-[var(--text)] md:text-[1.65rem] md:leading-tight">
            {displayName}
          </h2>
          {nameRowAside ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">{nameRowAside}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] leading-snug text-white/78">
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <Mail className="size-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            {emailBody}
          </span>
          <span className="hidden h-3.5 w-px shrink-0 bg-white/15 sm:block" aria-hidden />
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <Phone className="size-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            {phoneBody}
          </span>
        </div>

        {showRoleLine ? (
          <p className="text-body pt-0.5 text-sm text-white/65">{roleTitle}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/[0.05] pt-4 sm:border-t-0 sm:pt-0">
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <ProfileCompletenessRing
            value={profileCompleteness}
            size={34}
            strokeWidth={3.5}
            showCenterValue={false}
          />
          <div className="flex flex-col leading-none">
            <span className="text-label font-semibold uppercase tracking-[0.14em] text-white/60">
              Profile data
            </span>
            <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
              {profileCompleteness}%
            </span>
          </div>
        </div>
        {aside ? <div className="inline-flex items-center">{aside}</div> : null}
      </div>
    </div>
  );
}
