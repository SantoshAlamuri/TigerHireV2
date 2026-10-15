"use client";

import Link from "next/link";
import type { CriterionRow } from "@/lib/work/review";
import s from "./review.module.css";

/**
 * One candidate at a time. Evidence before score: every criterion line shows
 * the CV quote that supports it, and only quotes that passed verbatim
 * validation are ever shown.
 */
export function FocusView({
  name,
  headline,
  score,
  fallback,
  summary,
  summaryState,
  rows,
  risks,
  probes,
  facts,
  position,
  profileHref,
  requirementsUnavailable,
  decide,
}: {
  name: string;
  headline: string | null;
  score: number | null;
  fallback: boolean;
  summary: string;
  summaryState: "loading" | "ready" | "error";
  rows: CriterionRow[];
  risks: { text: string; tier: "red" | "amber" }[];
  probes: string[];
  facts: { label: string; value: string }[];
  position: string;
  profileHref: string | null;
  requirementsUnavailable: boolean;
  decide: React.ReactNode;
}) {
  return (
    <div className={s.focus}>
      <article className="wd-stack" style={{ gap: 36, minWidth: 0 }} aria-label={name}>
        <header className="wd-stack" style={{ gap: 14 }}>
          <div className={s.who}>
            <div style={{ minWidth: 0 }}>
              <span className="wd-small wd-muted">{position}</span>
              <h2 className="wd-h2">{name}</h2>
              {headline && <p className={s.headline}>{headline}</p>}
            </div>
            <div className={s.total}>
              <b>{score ?? "—"}</b>
              <span>{score == null ? "Not scored yet" : "Total score"}</span>
            </div>
          </div>
          {fallback && (
            <span
              className={s.fallback}
              title="The AI scorer was unavailable, so this was scored by keyword rules"
            >
              Fallback score. Check the evidence before deciding.
            </span>
          )}
          <div>
            <span className="wd-sig agent">The agent</span>
            {summaryState === "loading" ? (
              <p className={s.summary} role="status">
                Reading the agent&apos;s summary…
              </p>
            ) : summary ? (
              <p className={s.summary}>{summary}</p>
            ) : (
              <p className={`${s.summary} wd-muted`}>
                {summaryState === "error"
                  ? "The agent's summary could not be loaded. The evidence below is still accurate."
                  : "No summary for this candidate yet."}
              </p>
            )}
          </div>
          {profileHref && (
            <div>
              <Link className="wd-btn quiet" href={profileHref}>
                Open the full profile and CV
              </Link>
            </div>
          )}
        </header>

        <section aria-label="Score by criterion" className="wd-stack" style={{ gap: 10 }}>
          <span className="wd-small wd-muted">Each line, with the CV quote behind it</span>
          {rows.length ? (
            <div style={{ borderBottom: "1px solid var(--wd-hair)" }}>
              {rows.map((r) => (
                <div key={r.key} className={s.crit}>
                  <div className={s.critName}>
                    {r.label}
                    {r.weight != null && <span className={s.critWeight}>Weight {r.weight}</span>}
                  </div>
                  <div
                    className={`${s.critScore} ${r.score ? "" : s.none}`}
                    aria-label={r.score ? `Scored ${r.score}` : "No score stored"}
                  >
                    {r.score ?? "—"}
                  </div>
                  <div className={s.evidence}>
                    {r.quote ? (
                      <blockquote className={s.quote}>
                        &ldquo;{r.quote.quote}&rdquo;
                        <cite>
                          From the CV{r.quote.where ? `, ${r.quote.where}` : ""}. Checked word for
                          word.
                        </cite>
                      </blockquote>
                    ) : (
                      <span className={s.noEvidence}>No verified evidence</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={s.notice}>
              No rubric lines were stored for this score. Open the full profile to read the CV.
            </p>
          )}
        </section>

        {(risks.length > 0 || probes.length > 0 || requirementsUnavailable) && (
          <section aria-label="Risks and things to check" className="wd-stack" style={{ gap: 10 }}>
            <span className="wd-small wd-muted">Risks and things to check</span>
            <ul className={s.list}>
              {risks.map((r) => (
                <li key={r.text} className={s[r.tier]}>
                  {r.text}
                </li>
              ))}
              {probes.map((p) => (
                <li key={`probe-${p}`}>Must-have with no evidence: {p}. Ask in the interview.</li>
              ))}
            </ul>
            {requirementsUnavailable && (
              <p className={s.notice} role="status">
                The must-haves could not be loaded, so missing must-haves are not checked here.
              </p>
            )}
          </section>
        )}

        {facts.length > 0 && (
          <section aria-label="Logistics" className="wd-stack" style={{ gap: 12 }}>
            <span className="wd-small wd-muted">What they told us</span>
            <dl className={s.facts}>
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </article>

      <aside className={s.decide} aria-label="Your decision">
        {decide}
      </aside>
    </div>
  );
}
