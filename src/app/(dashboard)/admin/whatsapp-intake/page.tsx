"use client";

import { useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type IntakeItem = {
  id: string;
  source: string;
  sender_phone: string;
  filename: string | null;
  mime_type: string | null;
  caption: string | null;
  status: "received" | "stored" | "processed" | "failed" | "ignored";
  error: string | null;
  job_id: string | null;
  candidate_id: string | null;
  processed_at: string | null;
  created_at: string;
};

type IntakeJob = { id: string; title: string; org: string };

type IntakePayload = { items: IntakeItem[]; jobs: IntakeJob[] };

const STATUS_CLASS: Record<IntakeItem["status"], string> = {
  received: "text-white/55",
  stored: "text-amber-300",
  processed: "text-emerald-300",
  failed: "text-rose-300",
  ignored: "text-white/35",
};

export default function WhatsAppIntakePage() {
  const { toast } = useToast();
  const { data, loading, error, refetch } = useApiQuery<IntakePayload>(
    "/api/admin/whatsapp-intake",
  );
  const [jobByItem, setJobByItem] = useState<Record<string, string>>({});
  const [busyItem, setBusyItem] = useState<string | null>(null);

  async function runAction(
    itemId: string,
    action: "assign_and_process" | "retry" | "ignore",
    jobId?: string,
  ) {
    setBusyItem(itemId);
    try {
      const res = await fetch("/api/admin/whatsapp-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId, ...(jobId ? { jobId } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        toast({
          title: "Action failed",
          description: json.error ?? "Unknown error",
          tone: "error",
        });
        return;
      }
      toast({ title: `Item ${json.status ?? "updated"}`, tone: "success" });
      await refetch();
    } finally {
      setBusyItem(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-lifted p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-md border border-[var(--border-interactive)] px-4 py-2 text-sm text-white/65 hover:bg-white/[0.04]"
        >
          Retry
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const jobs = data?.jobs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
          <Inbox size={20} className="text-[var(--accent)]" />
          WhatsApp intake inbox
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Resumes forwarded by partners (Apna) to the dedicated intake number. Assign a job to push
          a resume through the standard pipeline — candidate creation, screening gate, and FitScore
          all behave exactly like email intake.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="card-lifted p-10 text-center text-sm text-white/55">
          No forwarded resumes yet. Once the intake number receives a PDF, it appears here.
        </div>
      ) : (
        <div className="card-lifted overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
                  <th className="px-3 py-3">Received</th>
                  <th className="px-3 py-3">File</th>
                  <th className="px-3 py-3">Caption</th>
                  <th className="px-3 py-3">Sender</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="min-w-[260px] px-3 py-3">Job</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = busyItem === item.id;
                  const selectedJob = jobByItem[item.id] ?? item.job_id ?? "";
                  const actionable = item.status === "stored" || item.status === "failed";
                  return (
                    <tr key={item.id} className="border-b border-[var(--border)]/60">
                      <td className="px-3 py-2.5 whitespace-nowrap text-white/65">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-white/80">{item.filename ?? "—"}</td>
                      <td
                        className="max-w-[220px] truncate px-3 py-2.5 text-white/55"
                        title={item.caption ?? ""}
                      >
                        {item.caption ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-white/55">
                        {item.sender_phone}
                      </td>
                      <td className={`px-3 py-2.5 ${STATUS_CLASS[item.status]}`}>
                        <span title={item.error ?? undefined}>{item.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {item.status === "processed" ? (
                          <span className="text-white/65">
                            {jobs.find((j) => j.id === item.job_id)?.title ?? item.job_id}
                          </span>
                        ) : (
                          <select
                            value={selectedJob}
                            onChange={(e) =>
                              setJobByItem((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            disabled={busy || !actionable}
                            className="w-full rounded-md border border-white/10 bg-[var(--surface)] px-2 py-1.5 text-sm text-white/80 disabled:opacity-50"
                          >
                            <option value="">Select job…</option>
                            {jobs.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.title}
                                {job.org ? ` — ${job.org}` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {actionable ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || !selectedJob}
                              onClick={() => runAction(item.id, "assign_and_process", selectedJob)}
                              className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                            >
                              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                              Process
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(item.id, "ignore")}
                              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/55 transition hover:bg-white/[0.04] disabled:opacity-50"
                            >
                              Ignore
                            </button>
                          </div>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-white/45">
        Tip: if the forward caption contains a TigerHire job id (UUID), the resume is processed
        automatically on arrival — the inbox is the manual path for everything else. Failed rows
        show the error on hover over the status.
      </p>
    </div>
  );
}
