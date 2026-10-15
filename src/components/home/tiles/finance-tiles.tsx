"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function FnOffersQueueTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=fn-offers-queue",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Offers in flight"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/company/finance" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Finance inbox
      </Link>
    </HomeTileCard>
  );
}

export function FnOpenJobsTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=fn-open-jobs",
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
      <p className="text-xs text-[var(--text-muted)]">Open job postings in your organisation</p>
    </HomeTileCard>
  );
}
