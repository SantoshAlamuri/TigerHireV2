"use client";

import { useEffect, useRef } from "react";
import { rejectChoices } from "@/lib/work/review";
import s from "./review.module.css";

/**
 * "Not a fit" asks one question: why. The reason feeds the fairness report and
 * decides whether the person stays in the talent pool. Keys 1-5 pick, Escape
 * cancels (handled by the block's key map).
 */
export function ReasonChoice({
  count,
  onPick,
  onCancel,
}: {
  count: number;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  return (
    <div role="group" aria-label="Why not a fit" className={s.reasons}>
      <div className="wd-row-actions" style={{ justifyContent: "space-between" }}>
        <span className="wd-sig you">
          Why {count > 1 ? `are these ${count} not a fit?` : "is this not a fit?"}
        </span>
        <button type="button" className="wd-btn quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol>
        {rejectChoices().map((r, i) => (
          <li key={r.id}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className={s.reason}
              onClick={() => onPick(r.id)}
            >
              <span className={s.kbd} aria-hidden="true">
                {i + 1}
              </span>
              <span>
                {r.label}
                {r.keepsInPool && <span className={s.pool}>Stays in your talent pool</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="wd-small wd-muted" style={{ margin: "8px 0 0" }}>
        Every reason feeds the fairness report.
      </p>
    </div>
  );
}
