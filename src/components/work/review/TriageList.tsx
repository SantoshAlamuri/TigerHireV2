"use client";

import { TIER_LABEL, TIER_NOTE, isFallbackScore, type TriageGroup } from "@/lib/work/review";
import s from "./review.module.css";

export interface TriageRow {
  id: string;
  name: string;
  score: number | null;
  location?: string | null;
  scoringMethod?: string | null;
}

/**
 * Triage at volume: a quiet ranked list grouped by what the agent recommends.
 * Borderline carries the amber "you" signal because that is where a human
 * changes the outcome; the agent's calls are blue.
 */
export function TriageList({
  groups,
  currentId,
  selected,
  disabled,
  onOpen,
  onToggle,
  onSelectGroup,
}: {
  groups: TriageGroup<TriageRow>[];
  currentId: string | null;
  selected: string[];
  disabled: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onSelectGroup: (ids: string[], on: boolean) => void;
}) {
  const picked = new Set(selected);
  return (
    <div className="wd-stack" style={{ gap: 40 }}>
      {groups.map((g) => {
        const ids = g.items.map((i) => i.id);
        const allOn = ids.every((id) => picked.has(id));
        const headId = `wd-review-${g.tier}`;
        return (
          <section key={g.tier} className={s.group} aria-labelledby={headId}>
            <div className={s.groupHead}>
              <h3
                id={headId}
                className={`wd-sig ${g.tier === "borderline" ? "you" : g.tier === "unscored" ? "auto" : "agent"}`}
                style={{ margin: 0, fontWeight: 400 }}
              >
                {TIER_LABEL[g.tier]} · {g.items.length}
              </h3>
              <span className={s.groupNote}>{TIER_NOTE[g.tier]}</span>
              <button
                type="button"
                className={`wd-btn quiet ${s.selectAll}`}
                disabled={disabled}
                onClick={() => onSelectGroup(ids, !allOn)}
              >
                {allOn ? "Clear selection" : `Select all ${g.items.length}`}
              </button>
            </div>
            <ul className={s.rows}>
              {g.items.map((it) => (
                <li key={it.id} className={s.row} data-current={it.id === currentId}>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={picked.has(it.id)}
                      disabled={disabled}
                      onChange={() => onToggle(it.id)}
                      aria-label={`Select ${it.name}`}
                    />
                  </label>
                  <button type="button" className={s.open} onClick={() => onOpen(it.id)}>
                    <span className={s.name}>{it.name}</span>
                    {(it.location || isFallbackScore(it.scoringMethod)) && (
                      <span className={s.sub}>
                        {[it.location, isFallbackScore(it.scoringMethod) && "Fallback score"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </button>
                  <span
                    className={s.rowScore}
                    aria-label={it.score == null ? "Not scored" : `Score ${it.score}`}
                  >
                    {it.score ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
