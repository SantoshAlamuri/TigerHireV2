"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";

type ResignationRow = {
  id: string;
  candidate_id: string;
  declared_by: string;
  created_at: string;
  profile_unlock_scheduled_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PendingResignationsPage() {
  const { data, loading, refetch } = useApiQuery<{ resignations: ResignationRow[] }>(
    "/api/employees/resign",
  );
  const [disputeResignationId, setDisputeResignationId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resignations = data?.resignations ?? [];

  async function handleDispute(resignationId: string) {
    if (!disputeReason.trim()) {
      setError("Please enter a reason for disputing.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees/resign/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resignationId, reason: disputeReason.trim() }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDisputeResignationId(null);
        setDisputeReason("");
        await refetch();
      } else {
        setError((json as { error?: string }).error ?? "Failed to dispute.");
      }
    } catch {
      setError("Failed to dispute. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Pending resignations"
        subtitle="Resignations in the 48-hour window. Dispute to pause profile unlock."
        actions={
          <Link
            href="/company"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="card-lifted p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : resignations.length === 0 ? (
        <div className="card-lifted p-12 text-center">
          <p className="text-body text-white/60">No pending resignations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
          <div className="card-lifted overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="heading-card px-4 py-3 text-xs font-medium text-white/60">
                    Declared
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium text-white/60">
                    Unlock scheduled
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium text-white/60">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {resignations.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3 text-white/60" suppressHydrationWarning>
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-white/60" suppressHydrationWarning>
                      {formatDate(r.profile_unlock_scheduled_at)}
                    </td>
                    <td className="px-4 py-3">
                      {disputeResignationId === r.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder="Reason for dispute (required)"
                            className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--text)]"
                          />
                          <button
                            type="button"
                            onClick={() => handleDispute(r.id)}
                            disabled={submitting}
                            className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-400"
                          >
                            {submitting ? "Submitting..." : "Submit dispute"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDisputeResignationId(null);
                              setDisputeReason("");
                            }}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-white/60"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDisputeResignationId(r.id)}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400"
                        >
                          Dispute
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
