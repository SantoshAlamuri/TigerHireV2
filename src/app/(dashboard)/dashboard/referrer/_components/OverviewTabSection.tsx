"use client";

import { ListOrdered } from "lucide-react";
import FitRing from "@/components/ui/FitRing";
import { formatInr } from "../_lib/helpers";
import type { ReferProfilePayload, TabKey } from "../_lib/types";

type OverviewTabSectionProps = {
  data: ReferProfilePayload;
  setActiveTab: (tab: TabKey) => void;
  totalCandidatesReferred: number;
  myRank: number | null;
  payoutRealization: number;
  linkActivationRate: number;
  loadOpenJobs: () => void;
  jobsLoading: boolean;
};

export function OverviewTabSection({
  data,
  setActiveTab,
  totalCandidatesReferred,
  myRank,
  payoutRealization,
  linkActivationRate,
  loadOpenJobs,
  jobsLoading,
}: OverviewTabSectionProps) {
  return (
    <section className="space-y-4">
      <div className="card-lifted border border-[var(--border)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <ListOrdered size={16} className="text-[var(--accent)]" />
          How to refer a profile
        </h2>
        <ol className="mt-3 list-inside list-decimal space-y-2.5 text-sm text-white/60">
          <li>
            Go to{" "}
            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              My Links
            </button>{" "}
            and generate a link for a role. That URL ties the applicant&apos;s profile to you.
          </li>
          <li>
            Copy the link or use Share on WhatsApp so the person you refer can open it on their
            phone.
          </li>
          <li>
            When they submit an application, you&apos;ll see them under{" "}
            <button
              type="button"
              onClick={() => setActiveTab("candidates")}
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Referred Candidates
            </button>
            .
          </li>
          <li>Bonuses follow each job&apos;s referral rules when milestones are met.</li>
        </ol>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-lifted rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">Pending</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text)]">
            {formatInr(data.earnings.pending_inr)}
          </p>
        </div>
        <div className="card-lifted rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">Paid</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text)]">
            {formatInr(data.earnings.paid_inr)}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-lifted rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Candidates referred</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
            {totalCandidatesReferred}
          </p>
        </div>
        <div className="card-lifted rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Active links</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{data.links.length}</p>
        </div>
        <div className="card-lifted rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Leaderboard rank</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{myRank ?? "—"}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-lifted flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/60">Payout realized</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">{payoutRealization}%</p>
          </div>
          <FitRing score={payoutRealization} size={54} showLabel={false} />
        </div>
        <div className="card-lifted flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/60">Link activation</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">{linkActivationRate}%</p>
          </div>
          <FitRing score={linkActivationRate} size={54} showLabel={false} />
        </div>
      </div>
      {data.links.length === 0 ? (
        <div className="card-lifted border border-[var(--border)] p-8 text-center">
          <p className="text-sm text-white/60">
            No referral links yet. Start with your first role.
          </p>
          <button
            type="button"
            onClick={loadOpenJobs}
            disabled={jobsLoading}
            className="mt-4 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {jobsLoading ? "Loading roles…" : "Start referring"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
