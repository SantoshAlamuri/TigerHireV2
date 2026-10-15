"use client";

import { useMemo, useState } from "react";
import { IntegrationRow } from "@/components/settings/IntegrationRow";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { Provider } from "@/lib/validations/integrations";

interface IntegrationApiRow {
  provider: Provider;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  masked_key?: string;
  oauth_account_email?: string;
  config?: Record<string, unknown>;
}

interface PersonalCalendarIntegrationsPanelProps {
  title: string;
  subtitle: string;
  basePath: string;
}

export function PersonalCalendarIntegrationsPanel(props: PersonalCalendarIntegrationsPanelProps) {
  const { data, loading, error, refetch } = useApiQuery<{ integrations: IntegrationApiRow[] }>(
    "/api/settings/me/integrations",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const integrationMap = useMemo(() => {
    const map = new Map<Provider, IntegrationApiRow>();
    (data?.integrations ?? []).forEach((row) => map.set(row.provider, row));
    return map;
  }, [data?.integrations]);

  const calendarProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter(
        (provider) =>
          provider.scopeSupport?.includes("user") &&
          (provider.provider === "google_calendar" ||
            provider.provider === "outlook" ||
            provider.provider === "teams"),
      ),
    [],
  );

  async function disconnectIntegration(provider: Provider) {
    const response = await fetch(`/api/settings/me/integrations/${provider}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || "Failed to disconnect integration");
    }
    setNotice(`${provider} disconnected`);
    await refetch();
  }

  async function saveIntegration() {
    throw new Error("Personal calendar integrations must be connected via OAuth.");
  }

  return (
    <SettingsModule title={props.title} subtitle={props.subtitle} basePath={props.basePath}>
      <div className="space-y-6">
        {notice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading personal integrations...</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Personal calendars</h3>
          <p className="text-xs text-[var(--text-muted)]">
            These connections are tied to your account and used when you book or reschedule
            interviews.
          </p>
          {calendarProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                oauthPathBase="/api/settings/me/integrations/oauth"
              />
            );
          })}
        </section>

        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Organisation-wide email and job board tools are managed by company admins in
          `/company/settings`. Platform room and transcription providers are managed in
          `/admin/settings`.
        </p>
      </div>
    </SettingsModule>
  );
}
