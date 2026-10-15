import type { ReactNode } from "react";

/** The moment the queue empties. Small, warm, and over quickly. */
export function AllClear({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <section className="wd-clear" aria-live="polite">
      <div className="wd-stripes" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      <h1 className="wd-h1" style={{ maxWidth: "22ch" }}>
        {title}
      </h1>
      <p className="wd-muted" style={{ margin: 0, maxWidth: "52ch" }}>
        {detail}
      </p>
      {action}
    </section>
  );
}
