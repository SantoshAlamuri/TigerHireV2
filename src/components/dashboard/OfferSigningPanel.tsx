"use client";

import { useCallback, useState } from "react";

type OfferEventRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
};

type OfferSigningRow = {
  id: string;
  status: string;
  signing_status?: string | null;
  sent_at?: string | null;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  view_count?: number | null;
  signed_at?: string | null;
  signer_name?: string | null;
  expires_at?: string | null;
  declined_at?: string | null;
  expired_at?: string | null;
  signed_pdf_path?: string | null;
  public_token?: string | null;
};

function formatTs(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function relTime(iso: string | null | undefined) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "less than an hour ago";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function OfferSigningPanel(props: { offerId: string }) {
  const [data, setData] = useState<{ offer: OfferSigningRow; events: OfferEventRow[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extendLocal, setExtendLocal] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/offers/${props.offerId}/signing`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        offer?: OfferSigningRow;
        events?: OfferEventRow[];
      };
      if (!res.ok) {
        setErr(j.error ?? "Failed to load");
        setData(null);
        return;
      }
      if (j.offer) setData({ offer: j.offer, events: j.events ?? [] });
    } finally {
      setLoading(false);
    }
  }, [props.offerId]);

  async function remind() {
    setBusy("remind");
    setErr(null);
    try {
      const res = await fetch(`/api/offers/${props.offerId}/signing/remind`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(j.error ?? "Reminder failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function extend() {
    if (!extendLocal) {
      setErr("Pick a new expiry date and time.");
      return;
    }
    setBusy("extend");
    setErr(null);
    try {
      const iso = new Date(extendLocal).toISOString();
      const res = await fetch(`/api/offers/${props.offerId}/signing/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expires_at: iso }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(j.error ?? "Extend failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const o = data?.offer;
  const sent = o?.sent_at;
  const viewed = o?.first_viewed_at;
  const vc = o?.view_count ?? 0;
  const signedAt = o?.signed_at;
  const signer = o?.signer_name;
  const exp = o?.expires_at;
  const expMs = exp ? new Date(exp).getTime() : null;
  const hoursLeft =
    expMs && expMs > Date.now() ? Math.max(0, (expMs - Date.now()) / 3600000) : null;
  const isOpen =
    o?.status === "sent" && o?.signing_status !== "signed" && o?.signing_status !== "declined";
  const awaitingCompanySignature = o?.signing_status === "pending_company";

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 text-xs text-[var(--text-muted)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[var(--text)]">Offer timeline</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
        >
          {loading ? "Loading…" : data ? "Refresh" : "Load"}
        </button>
      </div>
      {err ? <p className="text-[10px] text-red-300">{err}</p> : null}
      {data && o ? (
        <ul className="space-y-1.5 border-t border-[var(--border)] pt-2">
          <li>
            <span className="text-emerald-400">●</span> Sent {formatTs(sent ?? null)}
          </li>
          {viewed ? (
            <li>
              <span className="text-emerald-400">●</span> Viewed {formatTs(viewed)}
              {vc > 1 ? ` (viewed ${vc} times)` : ""}
              {o.last_viewed_at ? (
                <span className="block pl-4 text-[10px] text-[var(--text-subtle)]">
                  Last viewed {relTime(o.last_viewed_at)}
                </span>
              ) : null}
            </li>
          ) : (
            <li className="text-[var(--text-subtle)]">○ Not viewed yet</li>
          )}
          {awaitingCompanySignature ? (
            <li className="text-amber-300">
              ○ Awaiting company representative signature before candidate invitation
            </li>
          ) : null}
          {signedAt ? (
            <li>
              <span className="text-emerald-400">●</span> Signed {formatTs(signedAt)}
              {signer ? ` by ${signer}` : ""}
              {o.signed_pdf_path ? (
                <a
                  className="ml-2 font-medium text-[var(--accent)] hover:underline"
                  href={`/api/offers/${o.id}/download-signed`}
                >
                  Download signed copy
                </a>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}

      {data && o && isOpen && !awaitingCompanySignature ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-2">
          {hoursLeft != null ? (
            <p className="text-[11px] text-[var(--text)]">
              Expires in {Math.floor(hoursLeft / 24)}d {Math.floor(hoursLeft % 24)}h
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void remind()}
              className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {busy === "remind" ? "…" : "Send reminder"}
            </button>
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="datetime-local"
                value={extendLocal}
                onChange={(e) => setExtendLocal(e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10px] text-[var(--text)]"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void extend()}
                className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
              >
                {busy === "extend" ? "…" : "Extend deadline"}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-subtle)]">
            Withdraw this offer from the main row using Recall (candidate link stops working).
          </p>
        </div>
      ) : null}
    </div>
  );
}
