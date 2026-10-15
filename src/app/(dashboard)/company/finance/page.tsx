"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";

interface OfferRow {
  id: string;
  application_id?: string;
  role_title: string;
  status: string;
  band_status?: string | null;
  band_exception_reason?: string | null;
  compensation_json?: Record<string, unknown> | null;
}

function autoSendBadgeForOffer(offer: OfferRow): {
  label: string;
  className: string;
} {
  if (offer.band_status === "exception_pending") {
    return {
      label: "Manual follow-up likely",
      className:
        "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
    };
  }
  return {
    label: "Auto-send on approval",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  };
}

function formatCompensationSummary(
  comp: Record<string, unknown> | null | undefined,
): string | null {
  if (!comp || typeof comp !== "object") return null;
  const ctc = comp.ctc;
  if (typeof ctc === "number" && Number.isFinite(ctc)) {
    return `CTC: ${ctc.toLocaleString()}`;
  }
  try {
    const s = JSON.stringify(comp);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return null;
  }
}

export default function FinanceInboxPage() {
  const { data, loading, refetch } = useApiQuery<{ offers: OfferRow[] }>("/api/offers");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(offerId: string, decision: "approved" | "rejected") {
    setSubmittingId(offerId);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/tasks/offer_finance:${offerId}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, offerId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Unable to save decision");
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        autoSend?: { sent?: boolean; reason?: string; status?: number } | null;
      } | null;
      if (decision === "approved") {
        if (payload?.autoSend?.sent) {
          setNotice("Offer approved and sent to candidate automatically.");
        } else if (payload?.autoSend && payload.autoSend.sent === false) {
          const reason = payload.autoSend.reason?.trim();
          setNotice(
            `Offer approved, but auto-send did not complete${reason ? `: ${reason}` : "."} You can retry from Offers.`,
          );
        } else {
          setNotice("Offer approved.");
        }
      } else {
        setNotice("Offer rejected and returned to draft.");
      }
      await refetch();
    } finally {
      setSubmittingId(null);
    }
  }

  const pending = (data?.offers ?? []).filter((offer) => offer.status === "pending_admin");

  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Finance approvals"
        subtitle="Review compensation and offer exceptions before they are sent."
      />
      <div className="card-lifted p-4">
        {error ? <p className="mb-3 text-xs text-red-300">{error}</p> : null}
        {notice ? <p className="mb-3 text-xs text-emerald-300">{notice}</p> : null}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
                <Skeleton className="mt-3 h-8 w-44 rounded-full" />
              </div>
            ))}
          </div>
        ) : null}
        {!loading && pending.length === 0 && (
          <p className="text-sm text-white/60">No finance approvals pending.</p>
        )}
        <div className="space-y-3">
          {pending.map((offer) => {
            const compLine = formatCompensationSummary(offer.compensation_json ?? undefined);
            const sendBadge = autoSendBadgeForOffer(offer);
            return (
              <div
                key={offer.id}
                className="card-lifted flex flex-wrap items-start justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">{offer.role_title}</p>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sendBadge.className}`}
                    >
                      {sendBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-white/60">Status: {offer.status}</p>
                  {offer.band_status ? (
                    <p className="text-[11px] uppercase tracking-wide text-white/60">
                      Band: {String(offer.band_status).replace(/_/g, " ")}
                    </p>
                  ) : null}
                  {compLine ? (
                    <p className="font-mono tabular-nums text-xs text-white/60">{compLine}</p>
                  ) : null}
                  {offer.band_exception_reason ? (
                    <p className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-1.5 text-xs text-[var(--status-warning-fg)]">
                      <span className="font-semibold">Exception reason: </span>
                      {offer.band_exception_reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={Boolean(submittingId)}
                    onClick={() => decide(offer.id, "approved")}
                    className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {submittingId === offer.id ? "Saving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(submittingId)}
                    onClick={() => decide(offer.id, "rejected")}
                    className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
