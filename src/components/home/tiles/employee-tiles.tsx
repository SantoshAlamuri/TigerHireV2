"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function EmReferralsTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=em-referrals",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="My referrals"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link
        href="/employee?tab=referrals"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        View referrals
      </Link>
    </HomeTileCard>
  );
}

export function EmOpenRolesTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=em-open-roles",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Open roles (org)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/employee" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Refer & earn
      </Link>
    </HomeTileCard>
  );
}
