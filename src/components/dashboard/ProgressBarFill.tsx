"use client";

interface ProgressBarFillProps {
  value: number;
  fillClassName?: string;
  trackClassName?: string;
}

/**
 * Renders a progress bar (track + fill). Width is set via the --progress-pct
 * CSS variable on the track so the fill (which uses var(--progress-pct) in
 * globals.css) gets the correct width. Using a variable avoids hydration
 * mismatch from useId() differing between server and client under Suspense.
 */
export function ProgressBarFill({
  value,
  fillClassName = "",
  trackClassName = "relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]",
}: ProgressBarFillProps) {
  return (
    <div
      className={trackClassName}
      // Setting --progress-pct via style avoids hydration mismatch (useId differs under Suspense)
      style={{ ["--progress-pct" as string]: `${value}%` }}
    >
      <div
        className={`progress-bar-fill absolute inset-y-0 left-0 rounded-full ${fillClassName}`}
      />
    </div>
  );
}
