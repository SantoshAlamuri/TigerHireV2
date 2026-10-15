"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getBiasSeverityTone } from "@/lib/status-tones";

interface BiasIssue {
  category: string;
  severity: "low" | "medium" | "high";
  snippet: string;
  why: string;
  suggestion: string;
}

interface BiasCheckResult {
  summary: string;
  score: number;
  issues: BiasIssue[];
}

export function JdBiasDetectorCard({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BiasCheckResult | null>(null);

  async function runBiasCheck() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/bias`, {
        method: "GET",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: BiasCheckResult;
      };
      if (!response.ok || !payload.result) {
        setError(payload.error ?? "Could not run bias detector.");
        return;
      }
      setResult(payload.result);
    } catch {
      setError("Could not run bias detector.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 card-lifted p-5 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="heading-card text-base text-[var(--text)]">JD Bias Detector (beta)</h2>
          <p className="text-xs text-white/60">
            Quick DEI-language scan powered by Haiku. Use as guidance, not legal advice.
          </p>
        </div>
        <button
          type="button"
          onClick={runBiasCheck}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-white/[0.04] disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Running..." : "Run bias check"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="card-lifted px-3 py-2">
            <p className="text-sm text-[var(--text)]">{result.summary}</p>
            <p className="mt-1 text-xs text-white/60">Bias-safe score: {result.score}/100</p>
          </div>
          {result.issues.length === 0 ? (
            <p className="text-sm text-emerald-300">No major bias indicators found.</p>
          ) : (
            <ul className="space-y-2">
              {result.issues.map((issue, index) => (
                <li
                  key={`${issue.category}-${index}`}
                  className="rounded-xl border border-[var(--border)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text)]">
                      {issue.category}
                    </span>
                    <StatusBadge tone={getBiasSeverityTone(issue.severity)} size="sm">
                      {issue.severity}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-white/60">Snippet: &quot;{issue.snippet}&quot;</p>
                  <p className="mt-1 text-sm text-white/60">{issue.why}</p>
                  <p className="mt-1 text-sm text-[var(--text)]">Suggestion: {issue.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
