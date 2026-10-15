"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatFreshness,
  getSlaState,
  getSlaToneClass,
  hoursSince,
  REPORT_CARD_CLASS,
} from "./helpers";
import type { AgentLog, AgentsResponse, FitScoreObservabilityResponse } from "./types";

type ReliabilitySectionProps = {
  agentsLoading: boolean;
  agentsData: AgentsResponse | null | undefined;
  agentsError: unknown;
  observabilityLoading: boolean;
  observabilityData: FitScoreObservabilityResponse | null | undefined;
  observabilityError: unknown;
  failedAgentRuns: AgentLog[];
  longRunningAgentRuns: AgentLog[];
  reliabilitySignalsCount: number;
  reliabilityWatchItems: string[];
};

export function ReliabilitySection({
  agentsLoading,
  agentsData,
  agentsError,
  observabilityLoading,
  observabilityData,
  observabilityError,
  failedAgentRuns,
  longRunningAgentRuns,
  reliabilitySignalsCount,
  reliabilityWatchItems,
}: ReliabilitySectionProps) {
  const runsAvailable = !agentsLoading && !agentsError && !!agentsData;
  const signalsAvailable = !observabilityLoading && !observabilityError && !!observabilityData;
  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Reliability watch</h2>
          <p className="mt-1 text-xs text-white/60">
            Agent run failures and FitScore guardrails that need operator checks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/agents"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
          >
            Agent runs
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin/fitscore-observability"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
          >
            FitScore metrics
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin/cascade"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
          >
            Cascade &amp; cost
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/65">
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Failed/cancelled runs:{" "}
          <span className="font-semibold text-amber-300">
            {runsAvailable ? failedAgentRuns.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Running {">"}30m:{" "}
          <span className="font-semibold text-amber-300">
            {runsAvailable ? longRunningAgentRuns.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Guardrails tripped:{" "}
          <span className="font-semibold text-amber-300">
            {signalsAvailable ? reliabilitySignalsCount : "—"}
          </span>
        </span>
      </div>
      {((agentsLoading && !agentsData) || (observabilityLoading && !observabilityData)) &&
      !agentsError &&
      !observabilityError ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : agentsError || observabilityError ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Could not fully load reliability watch signals right now.
        </p>
      ) : (
        <div className="space-y-2">
          {failedAgentRuns.slice(0, 3).map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div>
                <p className="text-sm text-[var(--text)]">{log.agent_name ?? "Unknown agent"}</p>
                <p className="text-xs text-white/60">
                  {log.status ?? "unknown"} · {formatFreshness(log.created_at ?? null)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-1.5 py-0.5 text-xs text-white/70">
                    Assignee: Unassigned
                  </span>
                  {(() => {
                    const ageHours = hoursSince(log.created_at ?? null);
                    const state = getSlaState(ageHours, {
                      warningHours: 0.25,
                      breachHours: 0.5,
                    });
                    return (
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-xs ${getSlaToneClass(state)}`}
                      >
                        SLA 30m
                      </span>
                    );
                  })()}
                </div>
              </div>
              <AlertTriangle size={14} className="text-amber-300" />
            </div>
          ))}
          {reliabilityWatchItems.map((item) => (
            <p
              key={item}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-white/70"
            >
              {item}
            </p>
          ))}
          {failedAgentRuns.length === 0 && reliabilityWatchItems.length === 0 ? (
            <p className="text-sm text-white/60">No active reliability alerts detected.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
