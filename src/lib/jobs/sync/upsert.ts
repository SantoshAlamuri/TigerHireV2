import type { SupabaseClient } from "@supabase/supabase-js";
import { choosePreferredRecord } from "./dedup";
import type { NormalizedJob } from "@/lib/jobs/types";

export interface UpsertResult {
  inserted: number;
  updated: number;
  dropped: number;
}

export async function upsertAggregatedJobs(
  supabase: SupabaseClient,
  jobs: Array<NormalizedJob & { dedup_fingerprint: string }>,
  aggregatedOrgId: string,
): Promise<UpsertResult> {
  if (jobs.length === 0) return { inserted: 0, updated: 0, dropped: 0 };

  const nowIso = new Date().toISOString();
  const rows = jobs.map((job) => ({
    organisation_id: aggregatedOrgId,
    title: job.title,
    description: job.description,
    location: toLocationLabel(job.city),
    status: "open",
    source: job.source,
    source_url: job.source_url,
    source_job_id: job.source_job_id,
    tier: "aggregated",
    role_category: job.role_category,
    city: job.city,
    posted_at: job.posted_at?.toISOString() ?? nowIso,
    fetched_at: nowIso,
    dedup_fingerprint: job.dedup_fingerprint,
    is_active: true,
    list_on_public_job_board: true,
    list_for_internal_referrals: false,
    jd_sections: {
      version: 2,
      sections: [],
      external_company: job.company,
      source: job.source,
    },
  }));

  const { error } = await supabase.from("jobs").upsert(rows, {
    onConflict: "source,source_job_id",
    ignoreDuplicates: false,
  });
  if (error) throw error;

  const dropped = await deactivateDedupedRows(
    supabase,
    rows.map((row) => row.dedup_fingerprint),
  );
  return { inserted: rows.length, updated: 0, dropped };
}

export async function markStaleAggregatedJobsInactive(
  supabase: SupabaseClient,
  staleDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("tier", "aggregated")
    .eq("is_active", true)
    .lt("fetched_at", cutoff)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

async function deactivateDedupedRows(
  supabase: SupabaseClient,
  fingerprints: string[],
): Promise<number> {
  const unique = Array.from(new Set(fingerprints.filter(Boolean)));
  if (unique.length === 0) return 0;

  let dropped = 0;
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("jobs")
      .select("id, dedup_fingerprint, posted_at, source, is_active")
      .eq("tier", "aggregated")
      .eq("is_active", true)
      .in("dedup_fingerprint", chunk);
    if (error) throw error;

    const byFingerprint = new Map<
      string,
      Array<{ id: string; posted_at: string | null; source: string }>
    >();
    for (const row of data ?? []) {
      const fp = row.dedup_fingerprint as string | null;
      if (!fp) continue;
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp)!.push({
        id: row.id as string,
        posted_at: (row.posted_at as string | null) ?? null,
        source: row.source as string,
      });
    }

    for (const records of byFingerprint.values()) {
      if (records.length <= 1) continue;
      const preferred = choosePreferredRecord(records);
      const toDeactivate = records.filter((record) => record.id !== preferred.id).map((r) => r.id);
      if (toDeactivate.length === 0) continue;
      const { data: deactivated, error: deactivateError } = await supabase
        .from("jobs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", toDeactivate)
        .eq("is_active", true)
        .select("id");
      if (deactivateError) throw deactivateError;
      dropped += (deactivated ?? []).length;
    }
  }
  return dropped;
}

function toLocationLabel(city: string | null): string {
  if (!city) return "India";
  switch (city) {
    case "delhi_ncr":
      return "Delhi-NCR";
    default:
      return city.replace("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}
