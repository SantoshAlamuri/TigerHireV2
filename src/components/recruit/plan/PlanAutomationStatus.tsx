"use client";

import { useMemo } from "react";
import { Zap, ZapOff } from "lucide-react";
import {
  isPlanAutoExecuteUiEnabled,
  isPlanDocumentUiEnabled,
} from "@/lib/rollouts/plan-document-ui";
import type { PlanHistoryRow } from "@/lib/recruitment-plan/types";
import { formatDisplayDateTime } from "@/lib/locale/display";

/**
 * Shows which automation flags are on and the latest system event on this plan (if any).
 * Avoids implying automation runs when flags are off or nothing has fired yet.
 */
export function PlanAutomationStatus({ history }: { history: PlanHistoryRow[] }) {
  const planOn = isPlanDocumentUiEnabled();
  const autoOn = isPlanAutoExecuteUiEnabled();

  const lastSystemEvent = useMemo(() => {
    const system = history.filter((h) => h.actor_type === "system" || h.actor_type === "agent");
    if (system.length === 0) return null;
    return [...system].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [history]);

  if (!planOn) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/60 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2 text-white/70">
        {autoOn ? (
          <Zap className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        ) : (
          <ZapOff className="h-4 w-4 shrink-0 text-white/45" aria-hidden />
        )}
        <span>
          <strong className="text-[var(--text)]">Stage automation</strong> {autoOn ? "on" : "off"}
        </span>
      </div>
      {autoOn ? (
        lastSystemEvent ? (
          <p className="w-full text-white/50">
            Last automatic update:
            {formatDisplayDateTime(lastSystemEvent.created_at)}
          </p>
        ) : (
          <p className="w-full text-amber-400/90">No automatic updates yet.</p>
        )
      ) : null}
    </div>
  );
}
