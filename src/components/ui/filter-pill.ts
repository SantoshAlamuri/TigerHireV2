export type FilterPillSize = "sm" | "md";

const SIZE_CLASSES: Record<FilterPillSize, string> = {
  sm: "h-7 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

const FILTER_PILL_BASE_COMMON =
  "inline-flex items-center justify-center rounded-full border font-medium transition-colors duration-200 focus-ring";

/** @deprecated Prefer filterPillClass(active, size); kept for existing call sites. */
export const FILTER_PILL_BASE = `${FILTER_PILL_BASE_COMMON} ${SIZE_CLASSES.md}`;

export function filterPillClass(active: boolean, size: FilterPillSize = "md"): string {
  return `${FILTER_PILL_BASE_COMMON} ${SIZE_CLASSES[size]} ${
    active
      ? "border-[var(--border-interactive)] bg-[var(--surface-hover)] text-[var(--text)]"
      : "border-[var(--border)] bg-white/[0.02] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-white"
  }`;
}

export const AMBER_OUTLINE_ACTION_CLASS =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[var(--accent)]/45 bg-[var(--accent)]/10 px-4 text-sm font-semibold text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)]/65 hover:bg-[var(--accent)]/15 hover:text-[var(--accent-hover)] focus-ring disabled:cursor-not-allowed disabled:opacity-60";
