"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

type Batch = {
  id: string;
  reference: string;
  status: string;
  currency: string;
  total_amount: number;
  row_count: number;
  payment_reference: string | null;
  created_at: string;
  paid_at: string | null;
};

const ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04]";

function money(amount: number, currency: string): string {
  const n = Number(amount ?? 0);
  return `${currency === "INR" ? "₹" : `${currency} `}${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;
}

/**
 * TigerHire's payout console. Generate sweeps every company-confirmed bonus into
 * a run; the payee sheet is what the operator pays from; marking paid records
 * the transaction reference and is the write that finally sets every ledger row
 * in the run to 'paid'.
 */
export function PayoutRunsPanel() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payout-runs");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load payout runs");
      setBatches((json?.data?.batches ?? []) as Batch[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payout runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/payout-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate run");
      const batch = json?.data?.batch as Batch | null;
      setNotice(
        batch
          ? `${batch.reference} created — ${batch.row_count} bonuses, ${money(batch.total_amount, batch.currency)}.`
          : "No confirmed bonuses are waiting. Nothing to pay.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate run");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    if (reference.trim().length < 3) {
      setError("Enter the payment reference (UTR) before marking this run paid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payout-runs/${id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_reference: reference }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to mark paid");
      setNotice(`${json?.data?.batch?.reference ?? "Run"} marked paid.`);
      setPayingId(null);
      setReference("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark paid");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-400">{notice}</p> : null}

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        Generate payout run
      </button>

      {batches.length === 0 ? (
        <p className="text-sm text-white/60">No payout runs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-white/50">
                <th className="py-2 font-medium">Run</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Bonuses</th>
                <th className="py-2 text-right font-medium">Total</th>
                <th className="py-2 font-medium">Payment ref</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)]/50">
                  <td className="py-2 font-medium text-[var(--text)]">{b.reference}</td>
                  <td className="py-2 text-white/70">{b.status}</td>
                  <td className="py-2 text-right text-white/70">{b.row_count}</td>
                  <td className="py-2 text-right text-[var(--text)]">
                    {money(b.total_amount, b.currency)}
                  </td>
                  <td className="py-2 text-white/70">{b.payment_reference ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/admin/payout-runs/${b.id}/payees`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ACTION_CLASS}
                      >
                        <Download size={14} />
                        Payee sheet
                      </a>
                      {b.status === "open" ? (
                        payingId === b.id ? (
                          <span className="flex items-center gap-2">
                            <label htmlFor={`ref-${b.id}`} className="sr-only">
                              Payment reference for {b.reference}
                            </label>
                            <input
                              id={`ref-${b.id}`}
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                              placeholder="UTR / transaction ref"
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
                            />
                            <button
                              type="button"
                              onClick={() => markPaid(b.id)}
                              disabled={busy}
                              className={ACTION_CLASS}
                            >
                              Save
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPayingId(b.id)}
                            className={ACTION_CLASS}
                          >
                            Mark paid
                          </button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
