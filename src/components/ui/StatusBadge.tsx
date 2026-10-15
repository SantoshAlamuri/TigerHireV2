import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/status-tones";

const TONE_STYLES: Record<StatusTone, string> = {
  success:
    "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
  info: "border-[color:var(--status-info-border)] bg-[color:var(--status-info-bg)] text-[color:var(--status-info-fg)]",
  warning:
    "border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]",
  danger:
    "border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]",
  neutral:
    "border-[color:var(--status-neutral-border)] bg-[color:var(--status-neutral-bg)] text-[color:var(--status-neutral-fg)]",
};

type StatusBadgeSize = "sm" | "md";

const SIZE_STYLES: Record<StatusBadgeSize, string> = {
  sm: "px-2 py-0.5 text-label",
  md: "px-2.5 py-1 text-xs",
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  size?: StatusBadgeSize;
}

export function StatusBadge({ tone, children, icon, className, size = "md" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${SIZE_STYLES[size]} ${TONE_STYLES[tone]} ${className ?? ""}`.trim()}
    >
      {icon}
      {children}
    </span>
  );
}
