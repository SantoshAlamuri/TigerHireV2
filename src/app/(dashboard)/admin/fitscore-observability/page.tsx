"use client";

import { Gauge, Layers, Quote, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { useApiQuery } from "@/lib/hooks/use-api";

type MetricsResponse = {
  window: { since: string; hours: number };
  metrics: {
    cacheHitRatePct: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    inputTokens: number;
    batchConcurrencyHighWaterMark: number;
    batchConcurrencyConfiguredLimit: number;
    evidenceQuoteValidationPassRatePct: number;
    confidenceBandDistribution: {
      high: number;
      medium: number;
      low: number;
      unknown: number;
    };
  };
};

export default function AdminFitscoreObservabilityPage() {
  const { data, loading } = useApiQuery<MetricsResponse>("/api/admin/fitscore-observability");

  return (
    <>
      <PageHeader
        title="FitScore Observability"
        subtitle="24h guardrail metrics for cache efficiency, batch pressure, evidence quality, and confidence distribution"
      />
      {loading || !data ? (
        <div className="card-lifted rounded-xl p-5 text-sm text-white/60">Loading metrics…</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Cache hit rate (24h)"
              value={`${data.metrics.cacheHitRatePct.toFixed(2)}%`}
              icon={<Gauge size={18} />}
            />
            <StatCard
              label="Batch concurrency high-water mark"
              value={`${data.metrics.batchConcurrencyHighWaterMark}`}
              icon={<Layers size={18} />}
            />
            <StatCard
              label="Evidence quote validation pass rate"
              value={`${data.metrics.evidenceQuoteValidationPassRatePct.toFixed(2)}%`}
              icon={<Quote size={18} />}
            />
            <StatCard
              label="Confidence rows (high/med/low)"
              value={`${data.metrics.confidenceBandDistribution.high}/${data.metrics.confidenceBandDistribution.medium}/${data.metrics.confidenceBandDistribution.low}`}
              icon={<ShieldCheck size={18} />}
            />
          </div>

          <div className="card-lifted rounded-xl p-5">
            <p className="text-sm text-[var(--text)]">
              Window: last {data.window.hours}h (since{" "}
              {new Date(data.window.since).toLocaleString("en-GB", { hour12: true })})
            </p>
            <p className="mt-2 text-sm text-white/70">
              Cache tokens: read {data.metrics.cacheReadTokens.toLocaleString()} · creation{" "}
              {data.metrics.cacheCreationTokens.toLocaleString()} · input{" "}
              {data.metrics.inputTokens.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-white/70">
              Batch concurrency: high-water mark {data.metrics.batchConcurrencyHighWaterMark}{" "}
              (configured max observed {data.metrics.batchConcurrencyConfiguredLimit || 0})
            </p>
            <p className="mt-1 text-sm text-white/70">
              Confidence distribution (including unknown): high{" "}
              {data.metrics.confidenceBandDistribution.high}, medium{" "}
              {data.metrics.confidenceBandDistribution.medium}, low{" "}
              {data.metrics.confidenceBandDistribution.low}, unknown{" "}
              {data.metrics.confidenceBandDistribution.unknown}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
