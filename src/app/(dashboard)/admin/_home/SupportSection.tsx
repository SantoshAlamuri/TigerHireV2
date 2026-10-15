"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatFreshness,
  formatUserHint,
  getSlaState,
  getSlaToneClass,
  hoursSince,
  REPORT_CARD_CLASS,
} from "./helpers";
import type { WhatsAppSessionRow, WhatsAppSessionsResponse } from "./types";

type SupportSectionProps = {
  sessionsLoading: boolean;
  sessionsData: WhatsAppSessionsResponse | null | undefined;
  sessionsError: unknown;
  handoverSessions: WhatsAppSessionRow[];
  handoversStale: WhatsAppSessionRow[];
  humanTakeoversActive: WhatsAppSessionRow[];
};

export function SupportSection({
  sessionsLoading,
  sessionsData,
  sessionsError,
  handoverSessions,
  handoversStale,
  humanTakeoversActive,
}: SupportSectionProps) {
  const countsAvailable = !sessionsLoading && !sessionsError && !!sessionsData;
  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Latest support handovers</h2>
          <p className="mt-1 text-xs text-white/60">
            Screening conversations that need help. Up to 20 recent sessions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/support-requests"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
          >
            In-app tickets
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin/whatsapp-sessions"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
          >
            WhatsApp queue
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/65">
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Handover sessions:{" "}
          <span className="font-semibold text-[var(--text)]">
            {countsAvailable ? handoverSessions.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Stale {">"}2h:{" "}
          <span className="font-semibold text-amber-300">
            {countsAvailable ? handoversStale.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Human active:{" "}
          <span className="font-semibold text-[var(--text)]">
            {countsAvailable ? humanTakeoversActive.length : "—"}
          </span>
        </span>
      </div>
      {sessionsLoading && !sessionsData ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : sessionsError ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Could not load support handover queue right now.
        </p>
      ) : (
        <div className="space-y-2">
          {handoverSessions.slice(0, 4).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div>
                <p className="text-sm text-[var(--text)]">+{row.phone}</p>
                <p className="text-xs text-white/60">
                  {row.session_state} · last signal{" "}
                  {formatFreshness(row.last_candidate_message_at ?? row.last_message_at)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-1.5 py-0.5 text-xs text-white/70">
                    Assignee:{" "}
                    {formatUserHint(
                      typeof row.context?.handover_owner_id === "string"
                        ? row.context.handover_owner_id
                        : null,
                    )}
                  </span>
                  {(() => {
                    const ageHours = hoursSince(
                      row.last_candidate_message_at ?? row.last_message_at,
                    );
                    const state = getSlaState(ageHours, {
                      warningHours: 1,
                      breachHours: 2,
                    });
                    return (
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-xs ${getSlaToneClass(state)}`}
                      >
                        SLA 2h
                      </span>
                    );
                  })()}
                </div>
              </div>
              <span className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-xs uppercase tracking-wide text-amber-200">
                Handover
              </span>
            </div>
          ))}
          {handoverSessions.length === 0 ? (
            <p className="text-sm text-white/60">No handover sessions in queue.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
