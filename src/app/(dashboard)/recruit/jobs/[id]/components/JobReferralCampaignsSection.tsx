"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  metrics?: {
    sent?: number;
    applications?: number;
  } | null;
};

type Payload = {
  active: CampaignRow[];
  recentlyEnded: CampaignRow[];
};

export function JobReferralCampaignsSection({ jobId }: { jobId: string }) {
  const { data, loading } = useApiQuery<Payload>(
    jobId ? `/api/jobs/${jobId}/referral-campaigns` : null,
  );

  if (loading) {
    return (
      <section className="card-lifted p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-2/3" />
      </section>
    );
  }

  const active = data?.active ?? [];
  const recentlyEnded = data?.recentlyEnded ?? [];
  if (active.length === 0 && recentlyEnded.length === 0) return null;

  return (
    <section className="card-lifted space-y-3 p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">Referral campaigns</h3>
      {active.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">Active</p>
          {active.map((row) => (
            <CampaignLine key={row.id} row={row} />
          ))}
        </div>
      ) : null}
      {recentlyEnded.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Ended (last 30 days)
          </p>
          {recentlyEnded.map((row) => (
            <CampaignLine key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CampaignLine({ row }: { row: CampaignRow }) {
  const sent = row.metrics?.sent ?? 0;
  const apps = row.metrics?.applications ?? 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
      <Link
        href={`/company/referrals/campaigns/${row.id}`}
        className="font-medium text-[var(--accent)]"
      >
        {row.name}
      </Link>
      <span className="text-xs text-white/60">
        {sent} sent · {apps} applications · {row.status}
      </span>
    </div>
  );
}
