import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The single primary-action spec. Before this primitive the CTA spec
 * (`bg-[var(--accent)] text-black font-semibold rounded-_ px-_ py-_`) was
 * re-typed by hand in EmptyState, the skip link and twice on the homepage with
 * drifting radius/padding (audit F-08). `buttonClasses()` is exported so anchor
 * / Next <Link> call sites share the exact same spec without nesting a button.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-sm)] transition duration-200 focus-ring disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]",
  secondary:
    "border border-[var(--border-interactive)] bg-white/[0.04] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-white/[0.08]",
  ghost: "text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text)]",
  danger:
    "border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)] hover:bg-[color:var(--status-danger-bg)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-8 py-4 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return `${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ""}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
