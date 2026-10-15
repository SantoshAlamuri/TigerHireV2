"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type HubJob = { job_id: string; job_title: string; apply_url: string | null };

type HubPayload = {
  campaign: { id: string; name: string; status: string };
  company_name: string;
  jobs: HubJob[];
};

export default function ReferralCampaignHubPage() {
  const params = useParams<{ campaignId: string }>();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const campaignId = params?.campaignId;
  const [data, setData] = useState<HubPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId || !ref) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/referral-campaigns/${campaignId}/hub?ref=${encodeURIComponent(ref)}`,
        );
        const payload = (await res.json().catch(() => ({}))) as HubPayload & { error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Failed to load campaign");
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, ref]);

  if (!ref) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-white/70">
        Missing referral link.
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-red-300">{error}</main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-white/70">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-wide text-white/60">{data.company_name}</p>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{data.campaign.name}</h1>
        <p className="text-sm text-white/60">Open roles you can refer candidates to</p>
      </header>
      <ul className="space-y-3">
        {data.jobs.map((job) => (
          <li
            key={job.job_id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3"
          >
            <p className="font-medium text-[var(--text)]">{job.job_title}</p>
            {job.apply_url ? (
              <Link
                href={job.apply_url}
                className="mt-2 inline-block text-sm font-semibold text-[var(--accent)]"
              >
                Share apply link
              </Link>
            ) : (
              <p className="mt-2 text-xs text-white/60">Apply link unavailable</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
