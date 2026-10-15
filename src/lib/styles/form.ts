/**
 * Shared form class names used across dashboard components.
 * Interactive controls should use --border-interactive; decorative shells stay on --border.
 */

export const inputClass =
  "w-full rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50";

export const labelClass = "mb-1.5 block text-sm font-medium text-[var(--text-muted)]";

export const sectionTitleClass = "text-base font-semibold text-[var(--text)]";

export const sectionCardClass =
  "rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4";
