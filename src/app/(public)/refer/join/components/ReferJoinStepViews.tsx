"use client";

import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
} from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";

type OpenJobRow = {
  id: string;
  title: string;
  organisation_name: string;
  location: string | null;
  direct_bonus_amount: number;
};

type ClosedJobInfo = {
  job_id: string;
  job_title: string;
};

type GeneratedLinkDisplay = {
  job_id: string;
  job_title: string;
  token: string;
  apply_url: string;
  expires_at: string | null;
  linkKind: "new" | "existing";
};

export function ReferJoinStep4Links({
  headerOrgName,
  referralLinkTtlDays,
  closedJobsNotice,
  linksResult,
  copiedToken,
  copyLink,
  whatsAppShareUrl,
}: {
  headerOrgName?: string;
  referralLinkTtlDays: number | null;
  closedJobsNotice: ClosedJobInfo[];
  linksResult: GeneratedLinkDisplay[];
  copiedToken: string | null;
  copyLink: (token: string, url: string) => Promise<void>;
  whatsAppShareUrl: (jobTitle: string, url: string) => string;
}) {
  return (
    <Shell orgName={headerOrgName}>
      <div className="mx-auto max-w-lg py-8 md:py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 size={36} className="text-emerald-400" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">
            Your referral links
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Share each link with people you refer. Use WhatsApp for a ready-made message. After you
            sign in to your referrer dashboard you can see who applied and any bonus progress when
            the employer has configured rewards.
          </p>
          {referralLinkTtlDays != null ? (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              New links expire after {referralLinkTtlDays} day{referralLinkTtlDays === 1 ? "" : "s"}{" "}
              (each link shows its date below). If the role closes earlier, the link stops working
              immediately.
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Each link shows when it expires. If the role closes, the link stops working right
              away.
            </p>
          )}
        </div>

        {closedJobsNotice.length > 0 ? (
          <div
            className="mb-6 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100"
            role="status"
          >
            <p className="font-semibold text-amber-50">Closed role - no new link</p>
            <ul className="mt-2 list-inside list-disc text-amber-100/95">
              {closedJobsNotice.map((c) => (
                <li key={c.job_id}>
                  <span className="font-medium">{c.job_title}</span> is closed. Referral links are
                  not issued for closed jobs.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="space-y-4">
          {linksResult.map((row) => (
            <li
              key={row.job_id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-4"
            >
              <div className="flex items-start gap-3">
                <Briefcase size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">{row.job_title}</p>
                    {row.linkKind === "existing" ? (
                      <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Existing link
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        New
                      </span>
                    )}
                  </div>
                  {row.linkKind === "existing" ? (
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      You already had a link for this role - it was not recreated. Same URL as
                      before.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {row.expires_at ? (
                      <>
                        Valid until{" "}
                        <span className="font-medium text-[var(--text)]">
                          {new Date(row.expires_at).toLocaleDateString("en-GB", {
                            dateStyle: "medium",
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--text-subtle)]">No expiry date on file</span>
                    )}
                  </p>
                  <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{row.apply_url}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyLink(row.token, row.apply_url)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface)]/80"
                    >
                      {copiedToken === row.token ? (
                        <>
                          <ClipboardCheck size={14} className="text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy link
                        </>
                      )}
                    </button>
                    <a
                      href={whatsAppShareUrl(row.job_title, row.apply_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface)]/80"
                    >
                      <MessageCircle size={14} className="text-[#25D366]" aria-hidden />
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/refer/dashboard"
            className="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)]"
          >
            Go to my dashboard
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-subtle)]">
          The same URL is reused if you generate again for a role you already have a link for.
          Expiry and role status still apply.
        </p>
      </div>
    </Shell>
  );
}

export function ReferJoinStep3Jobs({
  headerOrgName,
  jobsForSelection,
  selectedJobIds,
  toggleJob,
  bonusPillLabel,
  handleStep3Generate,
  onBack,
  submitting,
  error,
}: {
  headerOrgName?: string;
  jobsForSelection: OpenJobRow[];
  selectedJobIds: Set<string>;
  toggleJob: (id: string) => void;
  bonusPillLabel: (amount: number) => string;
  handleStep3Generate: (e: React.FormEvent) => Promise<void>;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Shell orgName={headerOrgName}>
      <div className="mx-auto max-w-lg py-8 md:py-12">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Open roles
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">
            Pick your jobs
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Select roles you want links for. Bonus amounts are set by the employer when available -
            many roles have no cash bonus, but you can still refer and track applications from your
            dashboard after signup.
          </p>
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            New links include an expiry time (shown on the next step). Links also stop working when
            a role is closed.
          </p>
        </div>

        <form onSubmit={handleStep3Generate} className="space-y-4">
          <ul className="space-y-3">
            {jobsForSelection.map((j) => {
              const checked = selectedJobIds.has(j.id);
              return (
                <li key={j.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      checked
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/5"
                        : "border-[var(--border)] bg-[var(--surface)]/60 hover:border-[var(--text-muted)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleJob(j.id)}
                      className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text)]">{j.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {j.organisation_name}
                      </p>
                      {j.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <MapPin size={12} />
                          {j.location}
                        </p>
                      )}
                      <span className="mt-2 inline-block rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                        {bonusPillLabel(j.direct_bonus_amount)}
                        {j.direct_bonus_amount > 0 ? (
                          <span className="ml-1 text-[var(--accent)]">
                            · ₹
                            {j.direct_bonus_amount.toLocaleString("en-IN", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {error && (
            <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text)]"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={selectedJobIds.size === 0 || submitting}
              className="rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </span>
              ) : (
                "Generate my links"
              )}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children, orgName }: { children: React.ReactNode; orgName?: string }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
          {orgName ? (
            <span className="max-w-[55%] truncate text-sm font-medium text-[var(--text-muted)]">
              {orgName}
            </span>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4">{children}</main>
    </div>
  );
}
