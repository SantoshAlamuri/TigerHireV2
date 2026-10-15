import type { ReactNode } from "react";

type SetupSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function SetupSection({ title, description, children }: SetupSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
