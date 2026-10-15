import type { ReactNode } from "react";

/**
 * The moment a job needs nothing from you: say so plainly, show who carries it
 * from here, and offer the next thing.
 */
export function AllClear({
  title,
  detail,
  action,
  showWho = true,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  showWho?: boolean;
}) {
  return (
    <section className="wd-clear" aria-live="polite">
      <h2 className="wd-h1" style={{ maxWidth: "18ch" }}>
        {title}
      </h2>
      <p className="wd-lede">{detail}</p>
      {showWho && (
        <div className="wd-who-grid" style={{ marginTop: 12 }}>
          <div className="wd-panel">
            <span className="wd-sig auto">Automation</span>
            <p>Collects applications and applies your rules.</p>
          </div>
          <div className="wd-panel agent">
            <span className="wd-sig agent">Agent</span>
            <p>Scores every CV against the rubric, quoting the evidence.</p>
          </div>
          <div className="wd-panel you">
            <span className="wd-sig you">You</span>
            <p>Hear back here when a decision is yours.</p>
          </div>
        </div>
      )}
      {action && <div className="wd-row-actions">{action}</div>}
    </section>
  );
}
