interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Optional status pill/badge rendered inline next to the title (e.g. "Closed"). */
  titleBadge?: React.ReactNode;
}

/**
 * The one page header, at the redesign's scale.
 *
 * 81 screens render through this component and the redesigned screens wrote
 * their own inline header instead — at `text-xl font-bold` against this one's
 * `text-2xl font-extrabold sm:text-[1.7rem]`, and `mb-4` against `mb-6`. So
 * moving between two finished pages made the title jump a size and the content
 * shift down the page, which reads as two different applications stitched
 * together. That mismatch, not any individual screen, is most of what looks
 * unfinished when you click around.
 *
 * This is now the redesign's scale, so those 81 screens match the new ones
 * without being rewritten. `--text` rather than a hardcoded white keeps the
 * title on the theme token the rest of the system uses.
 */
export function PageHeader({ title, subtitle, actions, titleBadge }: PageHeaderProps) {
  return (
    <header className="page-header mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-5 sm:gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-pretty text-xl font-bold leading-tight tracking-tight text-[var(--text)]">
            {title}
          </h1>
          {titleBadge}
        </div>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-pretty text-sm font-normal leading-relaxed text-[var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end sm:gap-2.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
