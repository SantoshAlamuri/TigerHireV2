"use client";

import { Building2, Loader2, Mail, ShieldOff, X, Clock, Check, ShieldQuestion } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatInviteDate, type Consultant, type ConsultantInvite } from "./types";

const CARD = "rounded-xl border border-[var(--border)] bg-[var(--surface)]";
const GHOST_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50";

export function LinkedFirmsSection({
  consultants,
  loading,
  canManage,
  busyId,
  onRemove,
}: {
  consultants: Consultant[];
  loading: boolean;
  canManage: boolean;
  busyId: string | null;
  onRemove: (linkId: string, name: string) => void;
}) {
  return (
    <section className={CARD}>
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Firms with access</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          These firms can see your open roles and the candidates they submit for them.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : consultants.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No consulting firms have access yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {consultants.map((c) => (
            <li key={c.linkId} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text)]">{c.name}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Linked {formatInviteDate(c.linkedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge tone={c.isActive ? "success" : "neutral"}>
                  {c.isActive ? "Active" : "Paused"}
                </StatusBadge>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => onRemove(c.linkId, c.name)}
                    disabled={busyId === c.linkId}
                    className={GHOST_BUTTON}
                  >
                    {busyId === c.linkId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5" />
                    )}
                    Remove access
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PendingInvitesSection({
  invites,
  canManage,
  busyId,
  onRevoke,
}: {
  invites: ConsultantInvite[];
  canManage: boolean;
  busyId: string | null;
  onRevoke: (id: string) => void;
}) {
  if (invites.length === 0) return null;

  return (
    <section className={CARD}>
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Awaiting response</h2>
      </header>
      <ul className="divide-y divide-[var(--border)]">
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text)]">
                {i.agencyName || i.email}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <Mail className="h-3 w-3" />
                {i.email} · expires {formatInviteDate(i.expiresAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <Clock className="h-3.5 w-3.5" />
                Pending
              </span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onRevoke(i.id)}
                  disabled={busyId === i.id}
                  className={GHOST_BUTTON}
                >
                  {busyId === i.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Revoke
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InviteHistorySection({ invites }: { invites: ConsultantInvite[] }) {
  if (invites.length === 0) return null;

  return (
    <section className={CARD}>
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Invitation history</h2>
      </header>
      <ul className="divide-y divide-[var(--border)]">
        {invites.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-4 px-5 py-3 text-xs text-[var(--text-muted)]"
          >
            <span className="truncate">{i.agencyName || i.email}</span>
            <span className="inline-flex items-center gap-1.5">
              {i.status === "accepted" ? <Check className="h-3.5 w-3.5" /> : null}
              {i.status} · {formatInviteDate(i.acceptedAt ?? i.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Firms that asked for access and are waiting on a decision.
 *
 * This sits above the granted list on purpose: before the consent gate existed,
 * an agency could add itself and appear here as an established fact. A request
 * should read as a question, not as a fait accompli.
 */
export function AccessRequestsSection({
  requests,
  canManage,
  busyId,
  onDecide,
}: {
  requests: Consultant[];
  canManage: boolean;
  busyId: string | null;
  onDecide: (linkId: string, name: string, decision: "approve" | "decline") => void;
}) {
  if (requests.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5">
      <header className="border-b border-amber-500/20 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <ShieldQuestion className="h-4 w-4 text-amber-400" />
          Access requests
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          These firms asked to work on your roles. They can see nothing until you approve.
        </p>
      </header>
      <ul className="divide-y divide-amber-500/15">
        {requests.map((r) => (
          <li key={r.linkId} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text)]">{r.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Requested {formatInviteDate(r.linkedAt)}
              </p>
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDecide(r.linkId, r.name, "decline")}
                  disabled={busyId === r.linkId}
                  className={GHOST_BUTTON}
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => onDecide(r.linkId, r.name, "approve")}
                  disabled={busyId === r.linkId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-[var(--bg)] transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {busyId === r.linkId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Approve
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-xs text-[var(--text-muted)]">Awaiting leadership</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
