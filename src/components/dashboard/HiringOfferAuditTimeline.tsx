"use client";

import { Loader2 } from "lucide-react";
import { Download } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";

export interface HiringOfferAuditEventRow {
  id: string;
  event_type: string;
  created_at: string;
  prev_status: string | null;
  new_status: string | null;
  actor_role: string | null;
  comments: string | null;
  decision: string | null;
  channel?: string | null;
}

export function HiringOfferAuditTimeline({
  entityType,
  entityId,
  title = "Activity & decisions",
}: {
  entityType: "hiring_request" | "offer" | "workflow_stage";
  entityId: string | null | undefined;
  title?: string;
}) {
  const { user } = useAuth();
  const [days, setDays] = useState(90);
  const { data, loading, error } = useApiQuery<{ events: HiringOfferAuditEventRow[] }>(
    entityId ? "/api/audit/hiring-offer" : null,
    entityId ? { entityType, entityId } : undefined,
  );
  /** Aligned with GET /api/audit/hiring-offer/export — same org roles. */
  const canExport =
    user &&
    (user.role === "leadership" ||
      user.role === "super_admin" ||
      user.role === "recruiter" ||
      user.role === "finance");

  const events = data?.events ?? [];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-section text-base text-[var(--text)]">{title}</h2>
        {canExport ? (
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
            >
              <option value={30}>30d</option>
              <option value={90}>90d</option>
              <option value={180}>180d</option>
            </select>
            <a
              href={`/api/audit/hiring-offer/export?entityType=${entityType}&entityId=${entityId ?? ""}&days=${days}`}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              <Download size={12} />
              Export CSV
            </a>
          </div>
        ) : null}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading audit log…
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No recorded events yet.</p>
      )}
      {!loading && !error && events.length > 0 && (
        <ul className="space-y-3 border-l border-[var(--border)] pl-4">
          {events.map((ev) => (
            <li key={ev.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--accent)]" />
              <div className="font-medium text-[var(--text)]">
                {ev.event_type.replace(/_/g, " ")}
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {new Date(ev.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {ev.actor_role ? ` · ${ev.actor_role}` : ""}
                {ev.channel && ev.channel !== "web" ? ` · ${ev.channel}` : ""}
              </div>
              {(ev.prev_status || ev.new_status) && (
                <div className="mt-1 text-xs text-[var(--text-subtle)]">
                  {ev.prev_status ? `${ev.prev_status} → ` : ""}
                  {ev.new_status ?? "—"}
                </div>
              )}
              {ev.decision && (
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Decision: {ev.decision}
                </div>
              )}
              {ev.comments && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                  {ev.comments}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
