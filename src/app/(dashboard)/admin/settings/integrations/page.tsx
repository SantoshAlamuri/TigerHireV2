"use client";

import { useMemo, useState } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { IntegrationRow } from "@/components/settings/IntegrationRow";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import type { SettingsSection } from "@/features/settings/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { Provider, SaveApiKeyInput } from "@/lib/validations/integrations";

interface IntegrationApiRow {
  provider: Provider;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  category?: string;
  maturity?: "registered" | "connected" | "operational" | "compliant" | "monitored";
  lifecycle?: {
    stage?: string;
    health?: "healthy" | "degraded" | "idle";
    lastUpdatedAt?: string;
  };
  compliance?: {
    hasSecretRef?: boolean;
    hasAuditTrace?: boolean;
    hasStatusMessage?: boolean;
  };
  masked_key?: string;
  oauth_account_email?: string;
  config?: Record<string, unknown>;
}

const ADMIN_SECTIONS: SettingsSection[] = [
  {
    id: "integrations",
    label: "Integrations",
    href: "/admin/settings/integrations",
    description: "Platform-level provider policies and defaults.",
  },
  {
    id: "scim",
    label: "SCIM & Entra",
    href: "/admin/settings/scim",
    description: "Provisioning endpoints, group mappings, and sync operations.",
  },
];

export default function AdminSettingsIntegrationsPage() {
  const { data, loading, error, refetch } = useApiQuery<{ integrations: IntegrationApiRow[] }>(
    "/api/settings/platform/integrations",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const integrationMap = useMemo(() => {
    const map = new Map<Provider, IntegrationApiRow>();
    (data?.integrations ?? []).forEach((row) => map.set(row.provider, row));
    return map;
  }, [data?.integrations]);
  const platformSummary = useMemo(() => {
    const rows = data?.integrations ?? [];
    return {
      total: rows.length,
      connected: rows.filter((row) => row.status === "connected").length,
      degraded: rows.filter((row) => row.lifecycle?.health === "degraded").length,
    };
  }, [data?.integrations]);

  const platformProviders = useMemo(
    () => SETTINGS_PROVIDERS.filter((provider) => provider.scopeSupport?.includes("platform")),
    [],
  );

  async function saveIntegration(input: SaveApiKeyInput) {
    const response = await fetch("/api/settings/platform/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || "Failed to save platform integration");
    }
    setNotice(`${input.provider} updated`);
    await refetch();
  }

  async function disconnectIntegration(provider: Provider) {
    const response = await fetch(`/api/settings/platform/integrations/${provider}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || "Failed to disconnect platform integration");
    }
    setNotice(`${provider} disconnected`);
    await refetch();
  }

  return (
    <SettingsModule
      title="Admin Settings · Integrations"
      subtitle="Platform-owned room and transcription providers"
      basePath="/admin/settings"
      sections={ADMIN_SECTIONS}
    >
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">
              Platform providers
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">{platformSummary.total}</p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Connected</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {platformSummary.connected}
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Degraded</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {platformSummary.degraded}
            </p>
          </div>
        </section>

        {notice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-white/60">Loading platform integrations...</p> : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        {platformProviders.map((provider) => {
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
              category={row?.category}
              maturity={row?.maturity}
              lifecycle={row?.lifecycle}
              compliance={row?.compliance}
              maskedKey={row?.masked_key}
              oauthAccountEmail={row?.oauth_account_email}
              config={row?.config ?? provider.defaultConfig}
              fields={provider.fields}
              onSave={saveIntegration}
              onDisconnect={() => disconnectIntegration(provider.provider)}
            />
          );
        })}
      </div>
    </SettingsModule>
  );
}
