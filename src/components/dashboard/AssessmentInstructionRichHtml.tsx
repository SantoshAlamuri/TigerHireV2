"use client";

import { useEffect, useState } from "react";

const PURIFY_OPTS = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "hr",
    "span",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

function plainSnippetFromMixed(value: string, maxChars: number): string {
  const t = value.trim();
  const stripped = t
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = stripped || t.slice(0, maxChars + 120);
  if (base.length <= maxChars) return base;
  return `${base.slice(0, maxChars)}…`;
}

/** Readable length excluding tags — use for validating minimum real content before save. */
export function assessmentInstructionsVisibleTextApprox(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Safe HTML viewer for persisted assessment instructions/templates.
 * SSR and first paint: plain-text snippet avoids hydration mismatches before DOMPurify runs client-side.
 */
export function AssessmentInstructionRichHtml({
  html,
  className = "",
  emptyLabel = "",
}: {
  html: string;
  className?: string;
  emptyLabel?: string;
}) {
  const trimmed = html.trim();
  const [mounted, setMounted] = useState(false);
  const [safe, setSafe] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !trimmed) {
      setSafe("");
      return;
    }
    let cancelled = false;
    void import("dompurify").then(({ default: DOMPurify }) => {
      if (cancelled) return;
      setSafe(DOMPurify.sanitize(trimmed, PURIFY_OPTS));
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, trimmed]);

  if (!trimmed) {
    return emptyLabel ? <p className={`text-xs text-white/45 ${className}`}>{emptyLabel}</p> : null;
  }

  if (!mounted || !safe) {
    return (
      <div
        className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 text-xs leading-relaxed text-[var(--text-muted)] ${className}`}
      >
        <p>{plainSnippetFromMixed(trimmed, 800)}</p>
      </div>
    );
  }

  return (
    <div
      className={`assessment-html-view rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 text-xs leading-relaxed text-[var(--text)] [&_a]:cursor-pointer [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)]/35 [&_blockquote]:pl-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc ${className}`}
      // Safe: derived from DOMPurify
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
