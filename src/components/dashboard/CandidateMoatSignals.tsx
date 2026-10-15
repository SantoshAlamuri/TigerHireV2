"use client";

import { AlertCircle, Gift, ShieldCheck, Users } from "lucide-react";

export type PipelineVouchSummary = {
  voucher_name?: string | null;
  relationship_type?: string | null;
};

type VouchLike = { voucher_name?: string | null; relationship_type?: string | null };

function formatVouchTooltip(vouches: VouchLike[]): string {
  const lines = vouches
    .map((v) => {
      const name = v.voucher_name?.trim() || "Someone";
      const rel = v.relationship_type?.trim();
      return rel ? `${name} (${rel})` : name;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `Vouched by ${lines.join(", ")}`;
}

const PIPELINE_BADGE =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium";
const COMPACT_BADGE =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

export function PipelineMoatBadges({
  vouchCount,
  vouches,
  referrerName,
  referrerOrgVerified,
  referrerVerifiedOrgName,
  parentReferrerName,
}: {
  vouchCount?: number;
  vouches?: PipelineVouchSummary[];
  referrerName?: string | null;
  referrerOrgVerified?: boolean;
  referrerVerifiedOrgName?: string | null;
  parentReferrerName?: string | null;
}) {
  const count = vouchCount ?? vouches?.length ?? 0;
  const showVouch = count > 0;
  const showReferrer = Boolean(referrerName?.trim());

  if (!showVouch && !showReferrer) return null;

  const vouchLabel = count === 1 ? "1 vouch" : `${count} vouches`;
  const vouchTitle =
    vouches && vouches.length > 0
      ? formatVouchTooltip(vouches)
      : count > 0
        ? vouchLabel
        : undefined;

  let referrerTitle = referrerName ? `Referred by ${referrerName}` : undefined;
  if (referrerTitle && parentReferrerName) {
    referrerTitle += ` · via ${parentReferrerName}`;
  }
  if (referrerTitle && referrerOrgVerified && referrerVerifiedOrgName) {
    referrerTitle += ` · verified at ${referrerVerifiedOrgName}`;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-no-card-nav="true">
      {showVouch ? (
        <span className={`${PIPELINE_BADGE} bg-emerald-500/10 text-emerald-400`} title={vouchTitle}>
          <Users size={10} aria-hidden />
          {vouchLabel}
        </span>
      ) : null}
      {showReferrer ? (
        <span className={`${PIPELINE_BADGE} bg-sky-500/10 text-sky-300`} title={referrerTitle}>
          {referrerOrgVerified ? (
            <ShieldCheck size={10} className="text-sky-400" aria-hidden />
          ) : (
            <Gift size={10} aria-hidden />
          )}
          <span className="max-w-[10rem] truncate">Referred by {referrerName}</span>
        </span>
      ) : null}
    </span>
  );
}

export function CompactMoatBadges({
  vouchCount,
  vouches,
  ghostLabel,
}: {
  vouchCount?: number;
  vouches?: VouchLike[];
  ghostLabel?: string | null;
}) {
  const count = vouchCount ?? vouches?.length ?? 0;
  const showVouch = count > 0;
  const showReliability = ghostLabel === "MEDIUM" || ghostLabel === "HIGH";

  if (!showVouch && !showReliability) return null;

  const vouchLabel = count === 1 ? "1 vouch" : `${count} vouches`;
  const vouchTitle = vouches && vouches.length > 0 ? formatVouchTooltip(vouches) : vouchLabel;

  const ghostColor =
    ghostLabel === "MEDIUM"
      ? "bg-amber-500/15 text-amber-400"
      : ghostLabel === "HIGH"
        ? "bg-red-500/15 text-red-400"
        : "";

  const reliabilityTitle =
    ghostLabel === "HIGH"
      ? "Reliability signal is elevated — review before advancing."
      : "Reliability signal is mixed — worth a closer look.";

  return (
    <>
      {showVouch ? (
        <span className={`${COMPACT_BADGE} bg-emerald-500/10 text-emerald-400`} title={vouchTitle}>
          <Users size={11} aria-hidden />
          {vouchLabel}
        </span>
      ) : null}
      {showReliability && ghostColor ? (
        <span className={`${COMPACT_BADGE} ${ghostColor}`} title={reliabilityTitle}>
          Reliability: {ghostLabel}
        </span>
      ) : null}
    </>
  );
}

export type FitScoreMoatPanelProps = {
  vouches?: VouchLike[];
  referrerName?: string | null;
  referrerOrgVerified?: boolean;
  referrerVerifiedOrgName?: string | null;
  parentReferrerName?: string | null;
  ghostLabel?: string | null;
  authenticitySignal?: "likely_authentic" | "review_carefully" | "likely_ai_generated" | null;
  authenticityReasons?: string[] | null;
};

function authenticityCopy(
  signal: NonNullable<FitScoreMoatPanelProps["authenticitySignal"]>,
  reasons?: string[] | null,
): { label: string; detail: string; className: string } {
  const reasonText = reasons && reasons.length > 0 ? reasons.slice(0, 3).join(" · ") : undefined;
  if (signal === "likely_ai_generated") {
    return {
      label: "Authenticity flag",
      detail:
        reasonText ??
        "CV may show AI-generated or heavily templated content — verify in interview.",
      className: "border-red-500/30 bg-red-500/[0.06]",
    };
  }
  return {
    label: "Authenticity flag",
    detail: reasonText ?? "Review CV originality and supporting evidence before advancing.",
    className: "border-amber-500/30 bg-amber-500/[0.06]",
  };
}

export function VerdictMoatPanel({
  vouches,
  referrerName,
  referrerOrgVerified,
  referrerVerifiedOrgName,
  parentReferrerName,
  ghostLabel,
  authenticitySignal,
  authenticityReasons,
}: FitScoreMoatPanelProps) {
  const vouchList = vouches ?? [];
  const showVouch = vouchList.length > 0;
  const showReferrer = Boolean(referrerName?.trim());
  const showTrust = ghostLabel === "MEDIUM" || ghostLabel === "HIGH";
  const showAuthenticity =
    authenticitySignal === "review_carefully" || authenticitySignal === "likely_ai_generated";

  if (!showVouch && !showReferrer && !showTrust && !showAuthenticity) return null;

  const trustDetail =
    ghostLabel === "HIGH"
      ? "Reliability signal is elevated. Check timeline, references, and interview depth."
      : "Mixed reliability signals — validate key claims before advancing.";

  const auth =
    showAuthenticity && authenticitySignal
      ? authenticityCopy(authenticitySignal, authenticityReasons)
      : null;

  let referrerDetail = referrerName ? `Direct referral from ${referrerName}.` : "";
  if (parentReferrerName) referrerDetail += ` Via ${parentReferrerName}.`;
  if (referrerOrgVerified && referrerVerifiedOrgName) {
    referrerDetail += ` Org-verified at ${referrerVerifiedOrgName}.`;
  }

  return (
    <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
        Trust &amp; referral signals
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {showVouch ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
            <p className="text-xs font-semibold text-emerald-400">
              {vouchList.length === 1 ? "1 vouch" : `${vouchList.length} vouches`}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-sm text-[var(--text-muted)]">
              {vouchList.slice(0, 4).map((v, i) => (
                <li key={`${v.voucher_name ?? "v"}-${i}`}>
                  {v.voucher_name?.trim() || "Someone"}
                  {v.relationship_type ? (
                    <span className="text-[var(--text-subtle)]"> · {v.relationship_type}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {showReferrer ? (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5">
            <p className="text-xs font-semibold text-sky-300">Referral</p>
            <p className="mt-1 text-sm leading-snug text-[var(--text-muted)]">{referrerDetail}</p>
          </div>
        ) : null}
        {showTrust ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertCircle size={12} aria-hidden />
              Trust review
            </p>
            <p className="mt-1 text-sm leading-snug text-[var(--text-muted)]">{trustDetail}</p>
          </div>
        ) : null}
        {auth ? (
          <div className={`rounded-xl border px-3 py-2.5 ${auth.className}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertCircle size={12} aria-hidden />
              {auth.label}
            </p>
            <p className="mt-1 text-sm leading-snug text-[var(--text-muted)]">{auth.detail}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
