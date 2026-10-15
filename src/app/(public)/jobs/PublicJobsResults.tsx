"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Loader2,
  Briefcase,
  CheckCircle2,
  MessageCircle,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { trackEvent } from "@/lib/analytics/PostHogProvider";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";
import { useAuth } from "@/lib/auth/AuthProvider";

type RoleFilter =
  | "all"
  | "backend"
  | "frontend"
  | "data_ml"
  | "product"
  | "devops"
  | "design"
  | "sales"
  | "finance";
type CityFilter =
  | "all"
  | "bangalore"
  | "delhi_ncr"
  | "mumbai"
  | "hyderabad"
  | "chennai"
  | "pune"
  | "remote";
type TierFilter = "all" | "native";

type PublicJobsResponse = {
  jobs: PublicJob[];
  nextCursor: string | null;
  counts: { native: number; aggregated: number };
};

type PublicJob = {
  id: string;
  title: string;
  company: string;
  city: string | null;
  role_category?: string | null;
  tier: "native" | "aggregated";
  source: string;
  source_url: string | null;
  posted_at: string | null;
  description: string;
  compensation_min: number | null;
  compensation_max: number | null;
  show_salary: boolean;
};

const ROLE_OPTIONS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "All roles" },
  { id: "backend", label: "Backend" },
  { id: "frontend", label: "Frontend" },
  { id: "data_ml", label: "Data / ML" },
  { id: "product", label: "Product" },
  { id: "devops", label: "DevOps" },
  { id: "design", label: "Design" },
  { id: "sales", label: "Sales" },
  { id: "finance", label: "Finance" },
];

const CITY_OPTIONS: Array<{ id: CityFilter; label: string }> = [
  { id: "all", label: "All locations" },
  { id: "bangalore", label: "Bangalore" },
  { id: "delhi_ncr", label: "Delhi-NCR" },
  { id: "mumbai", label: "Mumbai" },
  { id: "hyderabad", label: "Hyderabad" },
  { id: "chennai", label: "Chennai" },
  { id: "pune", label: "Pune" },
  { id: "remote", label: "Remote" },
];

const FILTER_SELECT_CLASS =
  "w-full min-w-[10rem] appearance-none rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 pr-10 text-sm font-medium text-white transition hover:border-white/25 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

export function PublicJobsResults() {
  const { user } = useAuth();
  const [role, setRole] = useState<RoleFilter>("all");
  const [city, setCity] = useState<CityFilter>("all");
  const [tier, setTier] = useState<TierFilter>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const seenCards = useRef<Set<string>>(new Set());
  const limit = 20;

  const queryParams = useMemo(() => {
    return { role, city, tier, cursor, limit };
  }, [role, city, tier, cursor, limit]);

  const { data, loading, error } = useApiQuery<PublicJobsResponse>("/api/jobs/public", queryParams);

  useEffect(() => {
    if (!data) return;
    setJobs((prev) => (cursor ? [...prev, ...data.jobs] : data.jobs));
  }, [data, cursor]);

  useEffect(() => {
    trackEvent("jobs_page_view", { role, city, tier });
  }, [role, city, tier]);

  useEffect(() => {
    for (const job of jobs) {
      if (seenCards.current.has(job.id)) continue;
      seenCards.current.add(job.id);
      trackEvent("job_card_view", { job_id: job.id, tier: job.tier });
    }
  }, [jobs]);

  const total = (data?.counts.native ?? 0) + (data?.counts.aggregated ?? 0);
  const nextCursor = data?.nextCursor ?? null;
  const canLoadMore = Boolean(nextCursor);

  const resultsSubtitle = useMemo(() => {
    if (!loading && total === 0) {
      return "No open roles right now. Check back soon.";
    }
    if (total === 0) {
      return "Loading open roles…";
    }
    const jobLabel = total === 1 ? "role" : "roles";
    return `${total.toLocaleString()} open ${jobLabel} · newest first`;
  }, [loading, total]);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    setCursor(nextCursor);
  }, [nextCursor]);

  const onRoleChange = useCallback(
    (nextRole: RoleFilter) => {
      if (nextRole === role) return;
      trackEvent("role_pill_click", { from_role: role, to_role: nextRole });
      setRole(nextRole);
      setCursor(undefined);
      setJobs([]);
      seenCards.current.clear();
    },
    [role],
  );

  const onCityChange = useCallback((nextCity: CityFilter) => {
    setCity(nextCity);
    setCursor(undefined);
    setJobs([]);
    seenCards.current.clear();
  }, []);

  const onTierChange = useCallback(
    (nextTier: TierFilter) => {
      if (nextTier === tier) return;
      trackEvent("tier_toggle", { from: tier, to: nextTier });
      setTier(nextTier);
      setCursor(undefined);
      setJobs([]);
      seenCards.current.clear();
    },
    [tier],
  );

  return (
    <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white md:text-3xl">Open roles</h2>
          <p className="mt-1 text-sm text-white/70">{resultsSubtitle}</p>
        </div>
        <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => onTierChange("all")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tier === "all" ? "bg-[var(--accent)] text-black" : "text-white/70 hover:text-white"
            }`}
          >
            All jobs
          </button>
          <button
            type="button"
            onClick={() => onTierChange("native")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tier === "native" ? "bg-[var(--accent)] text-black" : "text-white/70 hover:text-white"
            }`}
          >
            TigerHire only
          </button>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[11rem] flex-1 sm:max-w-[14rem]">
          <label
            htmlFor="public-jobs-role"
            className="mb-1.5 block text-xs font-medium text-white/55"
          >
            Role
          </label>
          <select
            id="public-jobs-role"
            value={role}
            onChange={(e) => onRoleChange(e.target.value as RoleFilter)}
            className={FILTER_SELECT_CLASS}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-zinc-900 text-white">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute bottom-3 right-3 text-white/50"
            aria-hidden
          />
        </div>
        <div className="relative min-w-[11rem] flex-1 sm:max-w-[14rem]">
          <label
            htmlFor="public-jobs-city"
            className="mb-1.5 block text-xs font-medium text-white/55"
          >
            Location
          </label>
          <select
            id="public-jobs-city"
            value={city}
            onChange={(e) => onCityChange(e.target.value as CityFilter)}
            className={FILTER_SELECT_CLASS}
          >
            {CITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-zinc-900 text-white">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute bottom-3 right-3 text-white/50"
            aria-hidden
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3].map((x) => (
              <div
                key={`native-skel-${x}`}
                className="h-52 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[1, 2, 3, 4, 5].map((x) => (
              <div
                key={`agg-skel-${x}`}
                className="h-36 animate-pulse rounded-xl border border-white/10 bg-white/[0.02]"
              />
            ))}
          </div>
          <div className="flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-[var(--accent)]" aria-hidden />
          </div>
        </div>
      ) : error ? (
        <div className="card-lifted-marketing py-12 text-center text-white/70">
          Could not load jobs right now. Please try again.
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-lifted-marketing mt-10 py-16 text-center">
          <Briefcase size={48} className="mx-auto mb-4 text-white/55" aria-hidden />
          <p className="text-white/65">
            {tier === "native"
              ? "We don't have native jobs in this role/city yet. Switch to All jobs to see external listings."
              : "No jobs match this filter yet. Try a different role or city."}
          </p>
          {tier === "native" ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/company/post-job"
                className="inline-flex items-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Post one yourself for free
              </Link>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/waitlist"
                className="inline-flex items-center rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                Notify me about new jobs
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {jobs.map((job) => (
              <PublicTieredJobCard key={job.id} job={job} isLoggedIn={Boolean(user)} />
            ))}
          </div>
          {canLoadMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PublicTieredJobCard({ job, isLoggedIn }: { job: PublicJob; isLoggedIn: boolean }) {
  const isNative = job.tier === "native";
  const postedLabel = formatPosted(job.posted_at);
  const companyInitials = toInitials(job.company);
  const applyUrl = getPublicWhatsAppChatUrl(
    `${publicWhatsAppPrefill.candidateApply}\n\nRole: ${job.title}\nCompany: ${job.company}`,
  );

  if (!isNative) {
    return (
      <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white/75">
            {companyInitials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-medium text-white">{job.title}</h3>
            <p className="mt-0.5 text-sm text-white/60">
              {job.company} · {formatCity(job.city)} · via {formatSource(job.source)}
            </p>
            <p className="mt-2 text-xs text-white/45">FitScore unavailable for external jobs</p>
          </div>
          <span className="text-xs text-white/45">{postedLabel}</span>
        </div>
        <div className="mt-3">
          <a
            href={job.source_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackEvent("apply_click", { job_id: job.id, tier: job.tier, source: job.source });
              trackEvent("external_apply_click", { job_id: job.id, source: job.source });
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.06]"
          >
            View on {formatSource(job.source)} <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-white/75">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold">
              {companyInitials}
            </span>
            <CheckCircle2 size={14} className="text-sky-400" aria-hidden />
            Verified
          </p>
          <Link
            href={`/jobs/${job.id}`}
            className="mt-2 line-clamp-2 text-base font-semibold text-white transition hover:text-emerald-200 hover:underline"
          >
            {job.title}
          </Link>
          <p className="mt-1 text-sm text-white/65">
            {job.company} · {formatCity(job.city)}
          </p>
        </div>
        <div className="rounded-full border border-white/15 px-3 py-2 text-center">
          <p className="text-[11px] text-white/50">FitScore</p>
          <p className="text-xs font-semibold text-white">{isLoggedIn ? "Available" : "Sign in"}</p>
        </div>
      </div>

      <p className="mb-3 text-xs text-white/50">
        {isLoggedIn
          ? "FitScore is computed for native jobs only."
          : "Sign in to see your FitScore for this role."}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/jobs/${job.id}`}
            onClick={() =>
              trackEvent("job_detail_click", { job_id: job.id, tier: job.tier, source: job.source })
            }
            className="inline-flex items-center gap-1 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.06]"
          >
            View role
          </Link>
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent("apply_click", { job_id: job.id, tier: job.tier, source: job.source })
            }
            className="inline-flex items-center gap-2 rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            <MessageCircle size={15} aria-hidden />
            Apply on WhatsApp
          </a>
        </div>
        <span className="text-xs text-emerald-300">{postedLabel}</span>
      </div>
    </article>
  );
}

function formatSource(source: string): string {
  if (!source) return "Source";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatCity(city: string | null): string {
  if (!city) return "Flexible location";
  if (city === "delhi_ncr") return "Delhi-NCR";
  return city.replace("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatPosted(iso: string | null): string {
  if (!iso) return "Recently";
  const posted = new Date(iso).getTime();
  if (Number.isNaN(posted)) return "Recently";
  const days = Math.floor((Date.now() - posted) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function toInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TH";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
