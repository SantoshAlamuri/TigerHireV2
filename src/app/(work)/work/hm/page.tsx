"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { ApprovalTaskItem } from "@/lib/approvals/task-types";
import { canDecide, cardsFromApprovals } from "@/lib/work/hm";
import { postJson } from "@/components/work/interviews/post-json";

/**
 * The hiring manager's view. No queue, no navigation: the next yes-or-no,
 * the facts behind it, and two buttons. Deciding moves to the next one.
 */
export default function HiringManagerPage() {
  const { user } = useAuth();
  const q = useApiQuery<{ items: ApprovalTaskItem[] }>("/api/approvals");
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [saying, setSaying] = useState<"no" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const cards = useMemo(
    () => cardsFromApprovals(q.data?.items ?? []).filter((c) => !done.has(c.taskId)),
    [q.data, done],
  );
  const card = cards[0];
  const first = user?.name?.split(" ")[0];

  async function decide(decision: "approved" | "rejected") {
    if (!card || !canDecide(decision, reason)) return;
    setBusy(true);
    setError(null);
    const res = await postJson(`/api/approvals/tasks/${encodeURIComponent(card.taskId)}/decision`, {
      decision,
      comment: reason.trim() || null,
      ...card.body,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone((d) => new Set(d).add(card.taskId));
    setLast(`${decision === "approved" ? card.yes.replace(/^Yes, /, "") : card.no}: ${card.title}`);
    setSaying(null);
    setReason("");
  }

  if (q.loading && !q.data)
    return (
      <p role="status" className="wd-muted" style={{ padding: 32 }}>
        Finding what needs you…
      </p>
    );

  if (q.error)
    return (
      <div className="wd-page">
        <p role="alert" className="wd-problem">
          Your decisions could not be loaded: {q.error}
        </p>
        <button type="button" className="wd-btn" onClick={() => void q.refetch()}>
          Try again
        </button>
      </div>
    );

  if (!card)
    return (
      <div className="wd-page">
        <header className="wd-stack" style={{ gap: 18 }}>
          <span className="wd-sig auto">All clear</span>
          <h1 className="wd-h1" style={{ maxWidth: "16ch" }}>
            Nothing needs you{first ? `, ${first}` : ""}.
          </h1>
          <p className="wd-lede">
            {last ? `Last: ${last}. ` : ""}When a candidate or a new role needs your yes or no, it
            shows up here and on WhatsApp.
          </p>
        </header>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn" onClick={() => void q.refetch({ silent: true })}>
            Check again
          </button>
        </div>
      </div>
    );

  return (
    <div className="wd-page">
      <header className="wd-stack" style={{ gap: 18 }}>
        <span className="wd-sig you">
          {cards.length === 1 ? "Last one" : `1 of ${cards.length} need you`}
        </span>
        <p className="wd-muted" style={{ margin: 0 }}>
          {card.context}
        </p>
        <h1 className="wd-h1" style={{ maxWidth: "18ch" }}>
          {card.title}
        </h1>
        {last && (
          <p className="wd-small wd-muted" role="status" style={{ margin: 0 }}>
            Done: {last}
          </p>
        )}
      </header>

      <div className="wd-split">
        <div className="wd-lines">
          {card.facts.map(([k, v]) => (
            <div key={k} className="wd-line" style={{ gridTemplateColumns: "110px minmax(0,1fr)" }}>
              <span className="wd-line-label">{k}</span>
              <span className="wd-line-value">{v}</span>
            </div>
          ))}
        </div>
        {card.note && (
          <div className="wd-panel">
            <span className="wd-sig auto">Note from the recruiter</span>
            <p style={{ margin: "12px 0 0", lineHeight: 1.5 }}>{card.note}</p>
          </div>
        )}
      </div>

      {saying === "no" && (
        <label className="wd-stack" style={{ gap: 6, maxWidth: 560 }}>
          <span className="wd-small" style={{ color: "var(--wd-soft)" }}>
            Why not? The recruiter sees this.
          </span>
          <textarea
            className="wd-textarea"
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="wd-problem">
          {error}
        </p>
      )}

      <div className="wd-row-actions">
        {saying === "no" ? (
          <>
            <button
              type="button"
              className="wd-btn go"
              disabled={busy || !canDecide("rejected", reason)}
              onClick={() => void decide("rejected")}
            >
              {busy ? "Sending…" : card.no}
            </button>
            <button
              type="button"
              className="wd-btn quiet"
              onClick={() => {
                setSaying(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="wd-btn go"
              disabled={busy}
              onClick={() => void decide("approved")}
            >
              {busy ? "Sending…" : card.yes}
            </button>
            <button type="button" className="wd-btn" onClick={() => setSaying("no")}>
              {card.no}
            </button>
            {cards.length > 1 && (
              <button
                type="button"
                className="wd-btn quiet"
                onClick={() => setDone((d) => new Set(d).add(card.taskId))}
              >
                Later
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
