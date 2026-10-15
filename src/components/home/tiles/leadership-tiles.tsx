"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function LhOpenRolesTile() {
  const { data, loading, error } = useApiQuery<{ openRoles: number; empty: boolean }>(
    "/api/home/tiles?tile=lh-open-roles",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard title="Open roles" loading={loading} error={errMsg} empty={Boolean(data?.empty)}>
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.openRoles ?? 0}</p>
      <Link href="/company/jobs" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        View jobs
      </Link>
    </HomeTileCard>
  );
}

export function LhPipeline7dTile() {
  const { data, loading, error } = useApiQuery<{ moves: number; empty: boolean }>(
    "/api/home/tiles?tile=lh-pipeline-7d",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Pipeline activity (7 days)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.moves ?? 0}</p>
      <p className="text-xs text-[var(--text-muted)]">New pipeline rows in the last week</p>
      <Link href="/recruit/pipeline" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Open pipeline
      </Link>
    </HomeTileCard>
  );
}

export function LhOffers30dTile() {
  const { data, loading, error } = useApiQuery<{ sent: number; accepted: number; empty: boolean }>(
    "/api/home/tiles?tile=lh-offers-30d",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Offers (30 days)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-sm text-[var(--text)]">
        <span className="font-semibold">{data?.sent ?? 0}</span> offers ·{" "}
        <span className="font-semibold">{data?.accepted ?? 0}</span> accepted
      </p>
      <Link href="/company/offers" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        View offers
      </Link>
    </HomeTileCard>
  );
}

export function LhReferralLeadersTile() {
  const { data, loading, error } = useApiQuery<{
    leaders: Array<{ referrer_id: string; count: number }>;
    empty: boolean;
  }>("/api/home/tiles?tile=lh-referral-leaders");
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Referral volume (org)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <ul className="space-y-1 text-sm text-[var(--text)]">
        {(data?.leaders ?? []).map((row) => (
          <li key={row.referrer_id} className="flex justify-between gap-2">
            <span className="truncate font-mono text-xs">{row.referrer_id.slice(0, 8)}…</span>
            <span className="shrink-0 font-medium">{row.count}</span>
          </li>
        ))}
      </ul>
      <Link href="/company/referrals" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Referral tools
      </Link>
    </HomeTileCard>
  );
}
