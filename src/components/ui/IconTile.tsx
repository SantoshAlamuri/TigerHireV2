import type { ReactNode } from "react";

/**
 * The recessed icon "tile" — `rounded-md bg-white/[0.04] ring-1 ring-inset
 * ring-white/[0.06]` wrapping a Lucide icon — was copy-pasted ~10× across the
 * marketing homepage (and EmptyState used a larger sibling). Extracted so one
 * change restyles every feature icon (audit F-11).
 */

export type IconTileSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<IconTileSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-16 w-16 [&>svg]:h-10 [&>svg]:w-10",
};

interface IconTileProps {
  children: ReactNode;
  size?: IconTileSize;
  className?: string;
}

export function IconTile({ children, size = "md", className }: IconTileProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/[0.04] text-[var(--text-subtle)] ring-1 ring-inset ring-white/[0.06] ${SIZE_CLASSES[size]} ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}
