"use client";

import { useState } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import type { SettingsSection } from "@/features/settings/types";

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

export default function AdminScimSettingsPage() {
  const [token, setToken] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [groupExternalId, setGroupExternalId] = useState("");
  const [groupRole, setGroupRole] = useState("recruiter");
  const [entraSecret, setEntraSecret] = useState("");
  const [entraPayload, setEntraPayload] = useState(
    JSON.stringify(
      {
        users: [
          {
            userId: "",
            azureOid: "",
            organisationId: "",
            active: true,
            groupIds: [],
          },
        ],
      },
      null,
      2,
    ),
  );
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function callScim(path: string, method: "GET" | "POST", body?: Record<string, unknown>) {
    if (!token.trim()) {
      setResponse("Enter SCIM bearer token first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          ...(organisationId.trim() ? { "x-scim-organisation-id": organisationId.trim() } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      setResponse(`HTTP ${res.status}\n${text}`);
    } catch (err) {
      setResponse(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function runEntraSync() {
    if (!entraSecret.trim()) {
      setResponse("Enter ENTRA_SYNC_SECRET first.");
      return;
    }
    setLoading(true);
    try {
      const parsed = JSON.parse(entraPayload);
      const res = await fetch("/api/auth/entra/sync", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${entraSecret.trim()}`,
        },
        body: JSON.stringify(parsed),
      });
      const text = await res.text();
      setResponse(`HTTP ${res.status}\n${text}`);
    } catch (err) {
      setResponse(err instanceof Error ? err.message : "Failed to run Entra sync");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsModule
      title="Admin Settings · SCIM & Entra"
      subtitle="Operate SCIM provisioning and Entra sync flows from one place"
      basePath="/admin/settings"
      sections={ADMIN_SECTIONS}
    >
      <div className="space-y-4">
        <section className="space-y-3 card-lifted p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">SCIM session</h3>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="password"
              placeholder="SCIM bearer token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
            />
            <input
              type="text"
              placeholder="Organisation ID header (optional)"
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => callScim("/api/scim/v2/ServiceProviderConfig", "GET")}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-white/60"
            >
              ServiceProviderConfig
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                callScim(
                  userFilter.trim()
                    ? `/api/scim/v2/Users?filter=${encodeURIComponent(userFilter.trim())}`
                    : "/api/scim/v2/Users",
                  "GET",
                )
              }
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-white/60"
            >
              List users
            </button>
            <input
              type="text"
              placeholder='userName eq "user@org.com"'
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              className="min-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--text)]"
            />
          </div>
          <div className="space-y-2 card-lifted p-3">
            <p className="text-xs text-white/60">Create group-role mapping</p>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                type="text"
                placeholder="Azure group externalId"
                value={groupExternalId}
                onChange={(event) => setGroupExternalId(event.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
              />
              <input
                type="text"
                placeholder="TigerHire role"
                value={groupRole}
                onChange={(event) => setGroupRole(event.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
              />
              <button
                type="button"
                disabled={loading || !groupExternalId.trim() || !groupRole.trim()}
                onClick={() =>
                  callScim("/api/scim/v2/Groups", "POST", {
                    externalId: groupExternalId.trim(),
                    displayName: groupExternalId.trim(),
                    roles: [{ value: groupRole.trim() }],
                  })
                }
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
              >
                Create mapping
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3 card-lifted p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Entra sync runner</h3>
          <input
            type="password"
            placeholder="ENTRA_SYNC_SECRET"
            value={entraSecret}
            onChange={(event) => setEntraSecret(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)]"
          />
          <textarea
            rows={8}
            value={entraPayload}
            onChange={(event) => setEntraPayload(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)]"
          />
          <button
            type="button"
            disabled={loading}
            onClick={runEntraSync}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            Run Entra sync
          </button>
        </section>

        <section className="card-lifted p-4">
          <p className="mb-2 text-xs text-white/60">Response</p>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs text-[var(--text)]">
            {response || "No response yet."}
          </pre>
        </section>
      </div>
    </SettingsModule>
  );
}
