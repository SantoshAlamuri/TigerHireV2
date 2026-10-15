"use client";

import { useState } from "react";
import s from "./disclosure.module.css";

/**
 * A quiet row: label, a one-line summary, and the detail one tap away.
 * Keeps pages calm — the work you need is visible, the rest waits.
 */
export function Disclosure({
  label,
  summary,
  warn,
  defaultOpen = false,
  children,
}: {
  label: string;
  summary: React.ReactNode;
  warn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={s.row}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={s.label}>{label}</span>
        <span className={s.summary} data-warn={warn ? "true" : undefined}>
          {summary}
        </span>
        <i aria-hidden="true">{open ? "−" : "+"}</i>
      </button>
      {open && <div className={s.body}>{children}</div>}
    </div>
  );
}

export function DisclosureGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={s.group} aria-label={title}>
      {title && <h3 className={s.title}>{title}</h3>}
      <div>{children}</div>
    </section>
  );
}
