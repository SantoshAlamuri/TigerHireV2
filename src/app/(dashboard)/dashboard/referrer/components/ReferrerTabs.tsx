"use client";

import { useState } from "react";
import {
  Briefcase,
  ClipboardCopy,
  Loader2,
  MessageCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";

type LinkRow = {
  link_id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  company_name: string;
  apply_url: string;
  expires_at: string | null;
  direct_bonus_amount: number;
  parent_bonus_amount: number;
  applied_count: number;
};

type OpenJobRow = {
  id: string;
  title: string;
  organisation_name: string;
  direct_bonus_amount: number;
  parent_bonus_amount: number;
};

type PayoutRow = {
  id: string;
  candidate_name: string;
  job_title: string;
  amount: number;
  status: string;
  pipeline_stage: string;
  applied_at: string | null;
};

type EmployeeWhatsappReferralRow = {
  id: string;
  candidate_name: string;
  candidate_phone: string;
  status: string;
  created_at: string;
  referral_bonus_eligible: boolean;
  referral_bonus_paid_at: string | null;
  job_title: string | null;
};

type LeaderboardRow = {
  rank: number;
  referrer_id: string;
  name: string;
  city: string;
  total_paid: number;
  is_current: boolean;
};

const REFERRAL_EXPIRY_WARN_MS = 7 * 24 * 60 * 60 * 1000;

function employeeReferralStatusLabel(status: string): string {
  if (status === "invited") return "Invite sent";
  return status.replace(/_/g, " ");
}

/** Show bonus pill only when payout state is known — not on a fresh WhatsApp invite. */
function employeeReferralBonusLabel(referral: EmployeeWhatsappReferralRow): string | null {
  if (referral.referral_bonus_paid_at) return "Bonus paid";
  if (referral.referral_bonus_eligible) return "Bonus eligible";
  if (referral.status === "hired") return "Bonus pending";
  return null;
}

export function LinksTabSection(props: {
  links: LinkRow[];
  jobsLoading: boolean;
  loadOpenJobs: () => void;
  showJobPicker: boolean;
  linkActionMessage: { tone: "info" | "error"; text: string } | null;
  openJobs: OpenJobRow[];
  linkedJobIdSet: Set<string>;
  generateSingleJobLink: (jobId: string) => void;
  linkBusyJobId: string | null;
  copied: string | null;
  formatInr: (amount: number) => string;
  payoutSplitLabel: (direct: number, parent: number) => string;
  whatsAppReferralLinkShareUrl: (opts: {
    jobTitle: string;
    companyName: string;
    applyUrl: string;
    directBonusAmount: number;
  }) => string;
  renewReferralLink: (linkId: string, jobId: string) => void;
  renewBusyLinkId: string | null;
  copyUrl: (key: string, url: string) => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const {
    links,
    jobsLoading,
    loadOpenJobs,
    showJobPicker,
    linkActionMessage,
    openJobs,
    linkedJobIdSet,
    generateSingleJobLink,
    linkBusyJobId,
    copied,
    formatInr,
    payoutSplitLabel,
    whatsAppReferralLinkShareUrl,
    renewReferralLink,
    renewBusyLinkId,
    copyUrl,
  } = props;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--text)]">My Links</h2>
        <button
          type="button"
          onClick={loadOpenJobs}
          disabled={jobsLoading}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)]"
        >
          {jobsLoading ? "Loading…" : "Get link for a new role"}
        </button>
      </div>
      {showJobPicker ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
          {linkActionMessage ? (
            <p
              className={`mb-3 text-sm ${
                linkActionMessage.tone === "error" ? "text-red-400" : "text-white/60"
              }`}
              role="status"
            >
              {linkActionMessage.text}
            </p>
          ) : null}
          <p className="mb-3 text-sm text-white/60">Choose an open role:</p>
          <p className="mb-3 text-xs text-white/60">
            Each role has one fixed referral link per referrer. If you already created one, it
            appears under My Links - you cannot mint a second link for the same role. New links
            include an expiry time; when a role closes, links for that role stop working.
          </p>
          <div className="space-y-2">
            {openJobs.length === 0 ? (
              <p className="text-sm text-white/60">No open roles available right now.</p>
            ) : (
              openJobs.map((job) => {
                const alreadyLinked = linkedJobIdSet.has(job.id);
                return (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 card-lifted px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">{job.title}</p>
                      <p className="text-xs text-white/60">{job.organisation_name}</p>
                      <p className="mt-1 text-xs text-white/60">
                        You:{" "}
                        <span className="font-medium text-[var(--text)]">
                          {job.direct_bonus_amount > 0 ? formatInr(job.direct_bonus_amount) : "—"}
                        </span>
                        {" · "}Parent referrer:{" "}
                        <span className="font-medium text-[var(--text)]">
                          {job.parent_bonus_amount > 0 ? formatInr(job.parent_bonus_amount) : "—"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-white/60">
                        {payoutSplitLabel(job.direct_bonus_amount, job.parent_bonus_amount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => generateSingleJobLink(job.id)}
                      disabled={alreadyLinked || linkBusyJobId === job.id}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {alreadyLinked
                        ? "Link already exists"
                        : linkBusyJobId === job.id
                          ? "Generating..."
                          : copied === `new-${job.id}`
                            ? "Copied!"
                            : "Generate & copy"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {links.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-8 text-center text-sm text-white/60">
          No links yet. Generate your first one.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((row) => {
            const companyName = row.company_name?.trim() || "Company";
            const jobOpen = (row.job_status ?? "open") === "open";
            const expMs = row.expires_at ? new Date(row.expires_at).getTime() : Number.NaN;
            const linkExpired = Number.isFinite(expMs) && expMs <= nowMs;
            const expiringSoon =
              jobOpen &&
              Number.isFinite(expMs) &&
              expMs > nowMs &&
              expMs - nowMs <= REFERRAL_EXPIRY_WARN_MS;
            const showRenew = jobOpen && (linkExpired || expiringSoon);
            const expiryLabel = row.expires_at
              ? new Date(row.expires_at).toLocaleDateString("en-GB", { dateStyle: "medium" })
              : null;
            const waHref = whatsAppReferralLinkShareUrl({
              jobTitle: row.job_title,
              companyName,
              applyUrl: row.apply_url,
              directBonusAmount: row.direct_bonus_amount,
            });

            return (
              <li key={row.link_id} className="card-lifted p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <Briefcase size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-[var(--text)]">{row.job_title}</p>
                      {!jobOpen ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                          Closed
                        </span>
                      ) : null}
                    </div>
                    {!jobOpen ? (
                      <p className="mt-1 text-xs text-amber-200/90">
                        This role is no longer open. The URL may not accept new applications; use My
                        Links only for people who still need the same link for your records.
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-white/60">
                      {row.applied_count} candidate{row.applied_count === 1 ? "" : "s"} applied
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Split: You{" "}
                      <span className="font-medium text-[var(--text)]">
                        {row.direct_bonus_amount > 0 ? formatInr(row.direct_bonus_amount) : "—"}
                      </span>
                      {" · "}Parent referrer{" "}
                      <span className="font-medium text-[var(--text)]">
                        {row.parent_bonus_amount > 0 ? formatInr(row.parent_bonus_amount) : "—"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {payoutSplitLabel(row.direct_bonus_amount, row.parent_bonus_amount)}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {linkExpired ? (
                        <span className="text-red-300/90">Link expired</span>
                      ) : expiringSoon && expiryLabel ? (
                        <>
                          <span className="text-amber-200/90">Expires soon - </span>
                          valid until <span className="font-medium">{expiryLabel}</span>
                        </>
                      ) : expiryLabel ? (
                        <>
                          Valid until <span className="font-medium">{expiryLabel}</span>
                        </>
                      ) : (
                        <span className="text-white/60">No expiry date on file</span>
                      )}
                    </p>
                    {showRenew ? (
                      <p className="mt-1 text-xs text-white/60">
                        Same URL and token - we only extend the expiry. Resharing is optional.
                      </p>
                    ) : null}
                    <p className="mt-1 break-all text-xs text-white/60">{row.apply_url}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {showRenew ? (
                        <button
                          type="button"
                          onClick={() => renewReferralLink(row.link_id, row.job_id)}
                          disabled={renewBusyLinkId === row.link_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {renewBusyLinkId === row.link_id ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                          ) : (
                            <RefreshCw size={14} aria-hidden />
                          )}
                          Renew link
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => copyUrl(row.link_id, row.apply_url)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)]"
                      >
                        <ClipboardCopy size={14} />
                        {copied === row.link_id ? "Copied" : "Copy"}
                      </button>
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)]"
                      >
                        <MessageCircle size={14} className="text-[#25D366]" />
                        Share on WhatsApp
                      </a>
                    </div>
                  </div>
                  <div className="shrink-0 text-left sm:min-w-[7.5rem] sm:text-right">
                    <p className="text-2xl font-bold tabular-nums text-[var(--text)]">
                      {row.direct_bonus_amount > 0 ? formatInr(row.direct_bonus_amount) : "—"}
                    </p>
                    <p className="text-xs text-white/60">referral bonus</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function CandidatesTabSection(props: {
  payouts: PayoutRow[];
  employeeWhatsappReferrals: EmployeeWhatsappReferralRow[];
  daysSinceApplied: (iso: string | null) => number | null;
  pipelineStagePillClasses: (stage: string) => string;
  pipelineStageLabel: (stage: string) => string;
  payoutStatusPillClasses: (status: string) => string;
  employeeReferralStatusStyles: Record<string, string>;
  formatInr: (amount: number) => string;
}) {
  const {
    payouts,
    employeeWhatsappReferrals,
    daysSinceApplied,
    pipelineStagePillClasses,
    pipelineStageLabel,
    payoutStatusPillClasses,
    employeeReferralStatusStyles,
    formatInr,
  } = props;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Referred Candidates</h2>
        <p className="mt-1 text-sm text-white/60">
          People who applied through your referral links and bonus rows from the ledger appear here.
          If you are an employee, WhatsApp invites you sent from the older team form also list
          below.
        </p>
      </div>

      {payouts.length === 0 && employeeWhatsappReferrals.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-8 text-center text-sm text-white/60">
          No referred candidates yet. Go to My Links, generate a role link, and share it with
          someone you want to refer.
        </p>
      ) : payouts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/20 px-4 py-4 text-sm text-white/60">
          No applications through your personal links yet. If you used the team portal to send a
          WhatsApp invite, those referrals are listed below.
        </p>
      ) : null}

      {payouts.length > 0 ? (
        <ul className="space-y-3" role="list">
          {payouts.map((payout) => {
            const days = daysSinceApplied(payout.applied_at);
            return (
              <li key={payout.id} className="card-lifted p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug text-[var(--text)]">
                      {payout.candidate_name}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-white/60">{payout.job_title}</p>
                    <div
                      className="mt-3 flex flex-wrap items-center gap-2"
                      aria-label="Application and payout status"
                    >
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${pipelineStagePillClasses(payout.pipeline_stage)}`}
                      >
                        {pipelineStageLabel(payout.pipeline_stage)}
                      </span>
                      <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-2.5 py-0.5 text-xs font-medium text-white/60">
                        {days === null
                          ? "Applied date unknown"
                          : days === 0
                            ? "Applied today"
                            : `${days} day${days === 1 ? "" : "s"} since applied`}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${payoutStatusPillClasses(payout.status)}`}
                      >
                        {payout.status}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-[var(--border)] pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
                    <p className="text-xs uppercase tracking-wide text-white/60">Payout</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text)]">
                      {formatInr(payout.amount)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {employeeWhatsappReferrals.length > 0 ? (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <UserPlus size={16} className="text-[var(--accent)]" />
            WhatsApp invites (employee)
          </h3>
          <p className="text-sm text-white/60">
            Referrals created with name and phone from the team portal. Prefer link sharing above so
            every application is clearly tied to your referrer profile.
          </p>
          <ul className="space-y-3" role="list">
            {employeeWhatsappReferrals.map((referral) => {
              const bonusLabel = employeeReferralBonusLabel(referral);
              return (
                <li key={referral.id} className="card-lifted p-4">
                  <p className="text-base font-semibold text-[var(--text)]">
                    {referral.candidate_name}
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    {referral.job_title ?? "Role"} · {referral.candidate_phone}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${employeeReferralStatusStyles[referral.status] ?? "bg-zinc-500/15 text-zinc-300 border-zinc-500/35"}`}
                    >
                      {employeeReferralStatusLabel(referral.status)}
                    </span>
                    <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-2.5 py-0.5 text-xs font-medium text-white/60">
                      {new Date(referral.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    {bonusLabel ? (
                      <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80 px-2.5 py-0.5 text-xs font-medium text-white/60">
                        {bonusLabel}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function LeaderboardTabSection(props: {
  leaderboard: LeaderboardRow[];
  totalPaidInr: number;
  formatInr: (amount: number) => string;
}) {
  const { leaderboard, totalPaidInr, formatInr } = props;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text)]">Leaderboard</h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface)]/40 text-xs text-white/60">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Referrer</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-white/60">
                  No rankings yet.
                </td>
              </tr>
            ) : (
              leaderboard.map((row) => (
                <tr
                  key={row.referrer_id}
                  className={
                    row.is_current
                      ? "border-b border-[var(--border)]/60 bg-[var(--accent)]/10"
                      : "border-b border-[var(--border)]/60"
                  }
                >
                  <td className="px-3 py-2.5 text-white/60">{row.rank}</td>
                  <td className="px-3 py-2.5 text-[var(--text)]">
                    <span className="font-medium">{row.name}</span>
                    {row.is_current ? (
                      <span className="ml-2 text-xs font-normal text-[var(--accent)]">You</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-white/60">{row.city || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text)]">
                    {formatInr(row.total_paid)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4 text-center">
        <p className="text-sm text-white/60">
          <span className="font-semibold text-[var(--text)]">{formatInr(totalPaidInr)}</span> paid
          out to referrers
        </p>
      </div>
    </section>
  );
}
