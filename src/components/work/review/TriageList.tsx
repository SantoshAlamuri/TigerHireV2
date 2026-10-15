"use client";

import { TIER_LABEL, TIER_NOTE, isFallbackScore, type TriageGroup } from "@/lib/work/review";
import s from "./review.module.css";

export interface TriageRow {
  id: string;
  name: string;
  score: number | null;
  location?: string | null;
  years?: number | null;
  noticeDays?: number | null;
  ctcLpa?: number | null;
  /** The agent's strongest reason for. */
  plus?: string | null;
  /** The agent's strongest reason against. */
  minus?: string | null;
  scoringMethod?: string | null;
}

type Quick = "advance" | "hold" | "reject";

function facts(it: TriageRow): string {
  return [
    it.location,
    it.years != null ? `${it.years} yrs` : null,
    it.noticeDays != null
      ? it.noticeDays === 0
        ? "Can join now"
        : `${it.noticeDays}d notice`
      : null,
    it.ctcLpa != null ? `₹${it.ctcLpa} LPA` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Triage at volume: a ranked list grouped by what the agent recommends. Each
 * row says why in one line, and can be decided without opening it.
 */
export function TriageList({
  groups,
  currentId,
  selected,
  disabled,
  onOpen,
  onToggle,
  onSelectGroup,
  onQuick,
}: {
  groups: TriageGroup<TriageRow>[];
  currentId: string | null;
  selected: string[];
  disabled: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onSelectGroup: (ids: string[], on: boolean) => void;
  onQuick: (id: string, d: Quick) => void;
}) {
  const picked = new Set(selected);
  return (
    <div className="wd-stack" style={{ gap: 28 }}>
      {groups.map((g) => {
        const ids = g.items.map((i) => i.id);
        const allOn = ids.every((id) => picked.has(id));
        const headId = `wd-review-${g.tier}`;
        const tone = g.tier === "borderline" ? "you" : g.tier === "unscored" ? "auto" : "agent";
        return (
          <section key={g.tier} className={s.group} aria-labelledby={headId}>
            <div className={s.groupHead}>
              <h3 id={headId} className={`wd-sig ${tone} ${s.groupTitle}`}>
                {TIER_LABEL[g.tier]}
                <span className={s.groupCount}>{g.items.length}</span>
              </h3>
              <span className={s.groupNote}>{TIER_NOTE[g.tier]}</span>
              {g.items.length > 1 && (
                <button
                  type="button"
                  className={s.selectAll}
                  disabled={disabled}
                  onClick={() => onSelectGroup(ids, !allOn)}
                >
                  {allOn ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            <ul className={s.rows}>
              {g.items.map((it) => {
                const line = facts(it);
                const fallback = isFallbackScore(it.scoringMethod);
                return (
                  <li
                    key={it.id}
                    className={s.row}
                    data-current={it.id === currentId}
                    data-picked={picked.has(it.id)}
                  >
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={picked.has(it.id)}
                        disabled={disabled}
                        onChange={() => onToggle(it.id)}
                        aria-label={`Select ${it.name}`}
                      />
                      <span aria-hidden="true" />
                    </label>

                    <button type="button" className={s.open} onClick={() => onOpen(it.id)}>
                      <span className={s.who}>
                        <span className={s.name}>{it.name}</span>
                        {line && <span className={s.sub}>{line}</span>}
                      </span>
                      <span className={s.why}>
                        {it.plus && <span className={s.plus}>{it.plus}</span>}
                        {it.minus && <span className={s.minus}>{it.minus}</span>}
                        {!it.plus && !it.minus && (
                          <span className={s.sub}>
                            {it.score == null
                              ? "The agent hasn't read this CV yet"
                              : "Open to see the evidence"}
                          </span>
                        )}
                      </span>
                    </button>

                    <span
                      className={s.rowScore}
                      data-tone={tone}
                      aria-label={it.score == null ? "Not scored" : `Score ${it.score}`}
                    >
                      {it.score == null ? (
                        <span className={s.unscored}>No score</span>
                      ) : (
                        <>
                          <b>{Math.round(it.score)}</b>
                          <span className={s.scoreBar}>
                            <span style={{ width: `${Math.max(4, Math.min(100, it.score))}%` }} />
                          </span>
                          {fallback && <span className={s.unscored}>Fallback</span>}
                        </>
                      )}
                    </span>

                    <span className={s.quick} role="group" aria-label={`Decide on ${it.name}`}>
                      <button
                        type="button"
                        className={s.quickGo}
                        disabled={disabled}
                        onClick={() => onQuick(it.id, "advance")}
                      >
                        Interview
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onQuick(it.id, "hold")}
                      >
                        Hold
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onQuick(it.id, "reject")}
                      >
                        Not a fit
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
