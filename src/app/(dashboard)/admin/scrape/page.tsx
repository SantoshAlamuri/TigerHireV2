"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { Loader2, Play, CheckCircle2, AlertCircle } from "lucide-react";

interface ScrapeUsage {
  totalActorRuns?: number;
  monthlyUsage?: number;
  plan?: string;
}

interface UsageResponse {
  usage?: ScrapeUsage;
}

interface ScrapeBody {
  source: "naukri" | "indeed";
  keywords?: string;
  location?: string;
  maxResults?: number;
  query?: string;
}

interface ScrapeResponse {
  source: string;
  signalsFound?: number;
  jobsFound?: number;
  processed: number;
  created: number;
  errors: number;
}

export default function AdminScrapePage() {
  const [source, setSource] = useState<"naukri" | "indeed">("naukri");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [query, setQuery] = useState("");

  const { data: usageData, loading: usageLoading } =
    useApiQuery<UsageResponse>("/api/admin/scrape");

  const {
    mutate,
    loading: scraping,
    error: scrapeError,
  } = useOptimisticMutation<ScrapeResponse, ScrapeBody>("/api/admin/scrape", { method: "POST" });

  const [lastResult, setLastResult] = useState<ScrapeResponse | null>(null);
  const { toast } = useToast();

  const usage = usageData?.usage ?? {};

  useEffect(() => {
    if (!scrapeError) return;
    toast({
      title: "Scrape failed",
      description: scrapeError,
      tone: "error",
    });
  }, [scrapeError, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLastResult(null);
    toast({ title: "Scrape run started", tone: "info" });
    const body: ScrapeBody = {
      source,
      keywords: keywords.trim() || undefined,
      location: location.trim() || undefined,
      maxResults: maxResults || 50,
    };
    if (source === "indeed" && query.trim()) {
      body.query = query.trim();
    }
    const result = await mutate(body);
    if (result) {
      setLastResult(result);
      toast({
        title: "Scrape run completed",
        description: `Processed ${result.processed}, created ${result.created}, errors ${result.errors}.`,
        tone: "success",
      });
    }
  };

  return (
    <>
      <PageHeader title="Scraping" subtitle="Trigger candidate/job scraping runs" />
      <div className="mx-auto max-w-2xl space-y-6">
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <strong className="font-semibold">Internal / experimental.</strong> This page is for
          platform operators only, is not a stable customer-tenant feature, and may change without
          notice. Do not use for day-to-day hiring workflows.
        </div>
        {/* Usage card */}
        <div className="card-lifted rounded-xl p-6">
          <h2 className="mb-4 text-sm font-semibold text-white/60">Apify Usage</h2>
          {usageLoading ? (
            <div className="flex items-center gap-2 text-white/60">
              <Loader2 size={18} className="animate-spin" />
              <span>Loading usage...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6">
              {usage.totalActorRuns != null && (
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {usage.totalActorRuns.toLocaleString()}
                  </p>
                  <p className="text-sm text-white/60">Total Actor Runs</p>
                </div>
              )}
              {usage.monthlyUsage != null && (
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {usage.monthlyUsage.toLocaleString()}
                  </p>
                  <p className="text-sm text-white/60">Monthly Usage</p>
                </div>
              )}
              {usage.plan && (
                <div>
                  <p className="text-2xl font-bold text-[var(--text)]">{usage.plan}</p>
                  <p className="text-sm text-white/60">Plan</p>
                </div>
              )}
              {usage.totalActorRuns == null && usage.monthlyUsage == null && !usage.plan && (
                <p className="text-sm text-white/60">No usage data available</p>
              )}
            </div>
          )}
        </div>

        {/* Scraping form */}
        <div className="card-lifted rounded-xl p-6">
          <h2 className="mb-4 text-sm font-semibold text-white/60">Start Scraping Run</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Source selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/60">Source</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSource("naukri")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    source === "naukri"
                      ? "bg-[var(--accent)] text-black"
                      : "border border-[var(--border)] text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  Naukri
                </button>
                <button
                  type="button"
                  onClick={() => setSource("indeed")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    source === "indeed"
                      ? "bg-[var(--accent)] text-black"
                      : "border border-[var(--border)] text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  Indeed
                </button>
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label htmlFor="keywords" className="mb-1.5 block text-sm font-medium text-white/60">
                Keywords
              </label>
              <input
                id="keywords"
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. software engineer"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-medium text-white/60">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bangalore"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            {/* Max Results */}
            <div>
              <label
                htmlFor="maxResults"
                className="mb-1.5 block text-sm font-medium text-white/60"
              >
                Max Results
              </label>
              <input
                id="maxResults"
                type="number"
                min={1}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value) || 50)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            {/* Query (Indeed only) */}
            {source === "indeed" && (
              <div>
                <label htmlFor="query" className="mb-1.5 block text-sm font-medium text-white/60">
                  Query
                </label>
                <input
                  id="query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Indeed-specific query"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={scraping}
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scraping ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scraping in progress...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Start Scraping
                </>
              )}
            </button>
          </form>

          {/* Error message */}
          {scrapeError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{scrapeError}</span>
            </div>
          )}

          {/* Success results */}
          {lastResult && !scrapeError && (
            <div className="card-lifted mt-4 rounded-xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                <CheckCircle2 size={18} className="text-green-500" />
                Scraping completed
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-white/60">Source</p>
                  <p className="font-medium capitalize text-[var(--text)]">{lastResult.source}</p>
                </div>
                {lastResult.signalsFound != null && (
                  <div>
                    <p className="text-white/60">Signals found</p>
                    <p className="font-medium text-[var(--text)]">{lastResult.signalsFound}</p>
                  </div>
                )}
                {lastResult.jobsFound != null && (
                  <div>
                    <p className="text-white/60">Jobs found</p>
                    <p className="font-medium text-[var(--text)]">{lastResult.jobsFound}</p>
                  </div>
                )}
                <div>
                  <p className="text-white/60">Processed</p>
                  <p className="font-medium text-[var(--text)]">{lastResult.processed}</p>
                </div>
                <div>
                  <p className="text-white/60">Created</p>
                  <p className="font-medium text-[var(--text)]">{lastResult.created}</p>
                </div>
                <div>
                  <p className="text-white/60">Errors</p>
                  <p className="font-medium text-[var(--text)]">{lastResult.errors}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
