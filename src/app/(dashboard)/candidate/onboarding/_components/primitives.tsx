"use client";

import { IconTile } from "@/components/ui/IconTile";

export function StepHeading({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <IconTile size="md">{icon}</IconTile>
      <div>
        <h2 className="heading-card text-base text-[var(--text)]">{title}</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{hint}</p>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-caption font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ChipToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium capitalize transition-colors focus-ring ${
        active
          ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--border)] bg-white/[0.02] text-[var(--text-subtle)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}
