"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import type { SettingsSection } from "@/features/settings/types";
import { isSetupAppPath } from "@/features/setup/navigation";
import { navHrefMatchesPathname } from "@/components/dashboard/navigation";

interface SettingsModuleProps {
  title: string;
  subtitle?: string;
  /** When true, only render children (used under `company/settings` tab layout). */
  embedded?: boolean;
  basePath?: string;
  sections?: SettingsSection[];
  /** Label above horizontal section links (default: "Sections"). */
  sectionsNavLabel?: string;
  /**
   * Optional override for in-page section pills.
   * By default, pills are shown when explicit `sections` are passed.
   * On `/setup/*`, pills are hidden — `SetupShell` sidebar is the single section nav.
   */
  showSectionsNav?: boolean;
  children: React.ReactNode;
}

function SettingsSectionsNav({
  sections,
  navLabel,
}: {
  sections: SettingsSection[];
  navLabel: string;
}) {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-[var(--border)]/80 bg-[var(--surface)]/95 px-6 py-4 backdrop-blur-md lg:-mx-8 lg:px-8">
      <nav aria-label={navLabel}>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
          {navLabel}
        </p>
        <div className="flex flex-wrap gap-2 pb-1">
          {sections.map((section) => {
            const active =
              pathname === section.href || navHrefMatchesPathname(pathname, section.href);
            return (
              <Link
                key={section.id}
                href={section.href}
                scroll={false}
                title={section.description}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  active
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "border-[var(--border)] bg-white/[0.03] text-white/70 hover:border-[var(--border-hover)] hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function SettingsModule({
  title,
  subtitle,
  embedded = false,
  basePath: _basePath = "/company/settings",
  sections,
  sectionsNavLabel = "Sections",
  showSectionsNav,
  children,
}: SettingsModuleProps) {
  const pathname = usePathname();
  if (embedded) {
    return <>{children}</>;
  }
  const onSetupShell = isSetupAppPath(pathname);
  const wantsSections = showSectionsNav ?? Boolean(sections && sections.length > 0);
  const shouldShowSectionsNav = wantsSections && !onSetupShell;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className={onSetupShell ? "w-full" : "mx-auto w-full max-w-4xl lg:max-w-6xl"}>
        <div
          className={
            onSetupShell
              ? "rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur-sm lg:p-7"
              : "rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur-sm lg:p-8"
          }
        >
          {shouldShowSectionsNav && sections && sections.length > 0 ? (
            <SettingsSectionsNav sections={sections} navLabel={sectionsNavLabel} />
          ) : null}
          {children}
        </div>
      </div>
    </>
  );
}
