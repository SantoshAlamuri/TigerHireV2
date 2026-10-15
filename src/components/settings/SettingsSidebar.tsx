"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SettingsSection } from "@/features/settings/types";
import { isSettingsSectionActive } from "@/features/settings/nav";

export function SettingsSidebar({
  sections,
  settingsRoot,
}: {
  sections: SettingsSection[];
  /** Base path for settings (e.g. /company/settings). Used so "Overview" does not stay active on sub-routes. */
  settingsRoot: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-3">
      <nav className="space-y-1">
        {sections.map((section) => {
          const isActive = isSettingsSectionActive(pathname, section.href, settingsRoot);
          return (
            <Link
              key={section.id}
              href={section.href}
              className={`block rounded-xl px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
              }`}
            >
              <p className="font-medium">{section.label}</p>
              <p className="text-xs opacity-80">{section.description}</p>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
