import { ORG_HIRING_SETTINGS_READ_ONLY_HINT } from "@/lib/settings/org-hiring-settings-auth";

export function SettingsReadOnlyBanner() {
  return (
    <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-sm text-[var(--text-muted)]">
      {ORG_HIRING_SETTINGS_READ_ONLY_HINT}
    </p>
  );
}
