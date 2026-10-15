"use client";

import { useMemo, useState } from "react";
import { IntegrationRow } from "@/components/settings/IntegrationRow";
import { IdibuJobBoardSetupHint } from "@/components/settings/IdibuJobBoardSetupHint";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { Provider, SaveApiKeyInput } from "@/lib/validations/integrations";

interface IntegrationApiRow {
  provider: Provider;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  masked_key?: string;
  oauth_account_email?: string;
  config?: Record<string, unknown>;
}

const JOB_BOARD_PROVIDER_IDS = new Set<Provider>(["adzuna", "indeed", "idibu"]);

export default function CompanySettingsJobBoardsPage() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery<{ integrations: IntegrationApiRow[] }>(
    "/api/settings/org/integrations",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const integrationMap = useMemo(() => {
    const map = new Map<Provider, IntegrationApiRow>();
    (data?.integrations ?? []).forEach((row) => map.set(row.provider, row));
    return map;
  }, [data?.integrations]);

  const jobBoardProviders = useMemo(
    () => SETTINGS_PROVIDERS.filter((provider) => JOB_BOARD_PROVIDER_IDS.has(provider.provider)),
    [],
  );

  async function saveIntegration(input: SaveApiKeyInput) {
    const response = await fetch("/api/settings/org/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string; detail?: string };
      throw new Error(payload.detail || payload.error || "Failed to save job board integration");
    }
    setNotice(`${input.provider} updated`);
    await refetch();
  }

  async function disconnectIntegration(provider: Provider) {
    const response = await fetch(`/api/settings/org/integrations/${provider}`, {
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

  const organisationId = user?.organisationId;

  return (
    <SettingsModule
      embedded
      title="Job boards"
      subtitle="Configure outbound posting and inbound applications per organisation"
    >
      <div className="space-y-4">
        {notice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-white/60">Loading job board integrations...</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        {jobBoardProviders.map((provider) => {
          const row = integrationMap.get(provider.provider);
          const setupHint =
            provider.provider === "idibu" && organisationId && row?.status === "connected" ? (
              <IdibuJobBoardSetupHint organisationId={organisationId} />
            ) : undefined;

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
              setupHint={setupHint}
              onSave={saveIntegration}
              onDisconnect={() => disconnectIntegration(provider.provider)}
            />
          );
        })}
      </div>
    </SettingsModule>
  );
}
