"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

export type PayoutRow = {
  ledger_id: string;
  candidate_name: string | null;
  referrer_name: string | null;
  referrer_level: string;
  trigger_event: string;
  amount: number | null;
  currency: string;
  job_title: string | null;
  created_at: string;
};

const MILESTONE_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted",
  offer_accepted: "Offer accepted",
  day_90: "Day 90",
};

function formatAmount(amount: number | null, currency: string): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${currency === "INR" ? "₹" : `${currency} `}${n.toLocaleString("en-IN")}`;
}

/**
 * The company's only step in the payout flow: confirm the milestone was real.
 *
 * Confirming does not pay anyone — TigerHire disburses. It releases the bonus
 * into the next payout run, which is why the button says "Confirm" and the copy
 * says who pays.
 */
export function PayoutConfirmQueue() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/payouts?status=pending");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load payouts");
      setRows((json?.data?.payouts ?? []) as PayoutRow[]);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.ledger_id))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmSelected() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/referrals/payouts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger_ids: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to confirm");
      const confirmed = json?.data?.confirmed ?? 0;
      setNotice(
        `${confirmed} bonus${confirmed === 1 ? "" : "es"} confirmed. TigerHire pays these in the next run.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-400">{notice}</p> : null}

      {rows.length === 0 ? (
        <p className="text-sm text-white/60">
          Nothing awaiting confirmation. Bonuses appear here when a referred candidate reaches the
          milestone set on the job.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-white/50">
                  <th className="w-8 py-2" />
                  <th className="py-2 font-medium">Referrer</th>
                  <th className="py-2 font-medium">Candidate</th>
                  <th className="py-2 font-medium">Job</th>
                  <th className="py-2 font-medium">Milestone</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ledger_id} className="border-b border-[var(--border)]/50">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`Confirm bonus for ${row.referrer_name ?? "referrer"}`}
                        checked={selected.has(row.ledger_id)}
                        onChange={() => toggle(row.ledger_id)}
                      />
                    </td>
                    <td className="py-2 text-[var(--text)]">
                      {row.referrer_name ?? "—"}
                      {row.referrer_level === "parent" ? (
                        <span className="ml-1 text-xs text-white/40">(2nd level)</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-white/70">{row.candidate_name ?? "—"}</td>
                    <td className="py-2 text-white/70">{row.job_title ?? "—"}</td>
                    <td className="py-2 text-white/70">
                      {MILESTONE_LABEL[row.trigger_event] ?? row.trigger_event}
                    </td>
                    <td className="py-2 text-right text-[var(--text)]">
                      {formatAmount(row.amount, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={confirmSelected}
              disabled={selected.size === 0 || saving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Confirm {selected.size > 0 ? selected.size : ""} selected
            </button>
            {selected.size > 0 ? (
              <span className="text-sm text-white/60">
                {formatAmount(total, rows[0]?.currency ?? "INR")} released to the next payout run
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
