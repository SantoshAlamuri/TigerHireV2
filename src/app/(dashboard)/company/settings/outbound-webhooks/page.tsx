"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Webhook, Trash2, Power, Plus, Copy, Check, RefreshCw } from "lucide-react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { useApiQuery } from "@/lib/hooks/use-api";

type OutboundWebhook = {
  id: string;
  name: string | null;
  targetUrl: string;
  eventTypes: string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type OutboundDeliveryRow = {
  id: string;
  outboundWebhookId: string;
  hookName: string | null;
  targetUrl: string | null;
  eventType: string;
  deliveryStatus: "success" | "failed";
  httpStatus: number | null;
  errorMessage: string | null;
  attemptNumber: number;
  replayOf: string | null;
  createdAt: string;
};

function parseEventTypes(raw: string): string[] {
  const parts = raw
    .split(/[\s,]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["*"];
}

export default function OutboundWebhooksPage() {
  const { data, loading, error, refetch } = useApiQuery<{ webhooks: OutboundWebhook[] }>(
    "/api/settings/org/outbound-webhooks",
  );
  const webhooks = useMemo(() => data?.webhooks ?? [], [data?.webhooks]);
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "success" | "failed">("all");
  const canLoadDeliveries = !loading && !error;
  const {
    data: deliveryData,
    loading: deliveryLoading,
    error: deliveryError,
    refetch: refetchDeliveries,
  } = useApiQuery<{ deliveries: OutboundDeliveryRow[] }>(
    canLoadDeliveries ? "/api/settings/org/outbound-webhooks/deliveries" : null,
    { status: deliveryFilter, limit: 50 },
  );
  const deliveries = useMemo(() => deliveryData?.deliveries ?? [], [deliveryData?.deliveries]);

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEventTypes, setNewEventTypes] = useState("*");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [oneTimePreview, setOneTimePreview] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    setFormError(null);
    setActionNotice(null);
    setOneTimeSecret(null);
    setOneTimePreview(null);
    if (!newUrl.trim()) {
      setFormError("Enter a target URL (HTTPS).");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/settings/org/outbound-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newName.trim() || null,
          targetUrl: newUrl.trim(),
          eventTypes: parseEventTypes(newEventTypes),
          isEnabled: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        webhook?: {
          signingSecret?: string;
          signingSecretPreview?: string;
        };
      };
      if (!res.ok) {
        setFormError(json.error ?? "Failed to add webhook");
        return;
      }
      if (json.webhook?.signingSecret) {
        setOneTimeSecret(json.webhook.signingSecret);
        setOneTimePreview(json.webhook.signingSecretPreview ?? null);
        setActionNotice("Webhook created. Copy the signing secret now — it is not shown again.");
      } else {
        setActionNotice("Webhook created.");
      }
      setNewName("");
      setNewUrl("");
      setNewEventTypes("*");
      await refetch();
    } catch {
      setFormError("Request failed. Try again.");
    } finally {
      setAdding(false);
    }
  }, [newName, newUrl, newEventTypes, refetch]);

  const handleToggle = useCallback(
    async (w: OutboundWebhook) => {
      setTogglingId(w.id);
      setActionNotice(null);
      try {
        const res = await fetch(`/api/settings/org/outbound-webhooks/${w.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isEnabled: !w.isEnabled }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setFormError(json.error ?? "Could not update webhook");
          return;
        }
        setFormError(null);
        await refetch();
      } catch {
        setFormError("Could not update webhook");
      } finally {
        setTogglingId(null);
      }
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;
      if (
        !window.confirm("Remove this outbound webhook? Your endpoint will stop receiving events.")
      ) {
        return;
      }
      setDeletingId(id);
      setFormError(null);
      setActionNotice(null);
      try {
        const res = await fetch(`/api/settings/org/outbound-webhooks/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setFormError(json.error ?? "Failed to remove webhook");
          return;
        }
        setActionNotice("Webhook removed.");
        setOneTimeSecret(null);
        setOneTimePreview(null);
        await refetch();
      } catch {
        setFormError("Failed to remove webhook");
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, refetch],
  );

  const handleReplayDelivery = useCallback(
    async (deliveryId: string) => {
      setReplayingId(deliveryId);
      setFormError(null);
      setActionNotice(null);
      try {
        const res = await fetch(
          `/api/settings/org/outbound-webhooks/deliveries/${deliveryId}/replay`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
        if (!res.ok) {
          setFormError(json.error ?? "Replay failed");
          await refetchDeliveries({ silent: true });
          return;
        }
        setFormError(null);
        setActionNotice("Delivery replayed. Check the new row in the log.");
        await refetchDeliveries({ silent: true });
      } catch {
        setFormError("Replay request failed");
      } finally {
        setReplayingId(null);
      }
    },
    [refetchDeliveries],
  );

  const copySecret = useCallback(() => {
    if (!oneTimeSecret) return;
    void navigator.clipboard.writeText(oneTimeSecret);
    setCopyOk(true);
    setTimeout(() => setCopyOk(false), 2000);
  }, [oneTimeSecret]);

  return (
    <SettingsModule
      title="Settings · Outbound webhooks"
      subtitle="Send signed JSON payloads to your own HTTPS endpoints for application and offer events (E-webhooks / enterprise)."
    >
      <div className="space-y-6">
        <p className="text-sm text-white/60">
          This is for{" "}
          <span className="text-[var(--text)]">HTTP callbacks from TigerHire to your systems</span>
          (HMAC-signed). It is not the same as job-board integrations — see{" "}
          <Link
            href="/company/settings/integrations"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Integrations
          </Link>{" "}
          for credentials and boards. When running the app, OpenAPI and event details are available
          at <code className="text-xs">/api/openapi</code>.
        </p>

        {actionNotice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {actionNotice}
          </p>
        ) : null}
        {oneTimeSecret ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-200">
              Signing secret (store securely — shown once)
            </p>
            <p className="mt-1 break-all font-mono text-sm text-[var(--text)]">{oneTimeSecret}</p>
            {oneTimePreview ? (
              <p className="mt-1 text-xs text-white/60">Preview: {oneTimePreview}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void copySecret()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              {copyOk ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copyOk ? "Copied" : "Copy secret"}
            </button>
          </div>
        ) : null}
        {formError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {formError}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-[var(--border)]/30 bg-[var(--surface)]/40"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-stretch gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-center sm:text-left">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="self-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-white/60 hover:bg-white/[0.04] sm:self-start"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && webhooks.length === 0 ? (
          <div className="card-lifted px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-500/15 text-zinc-400">
              <Webhook className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-[var(--text)]">No webhooks yet</h2>
            <p className="mt-2 text-sm text-white/60">
              Add a URL below. We deliver JSON with an{" "}
              <code className="text-xs">X-TigerHire-Signature</code> header for verification.
            </p>
          </div>
        ) : null}

        {!loading && !error && webhooks.length > 0 ? (
          <ul className="space-y-3">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-[var(--text)]">
                    {w.name?.trim() || "Unnamed endpoint"}
                  </p>
                  <p className="break-all text-sm text-white/60">{w.targetUrl}</p>
                  <p className="text-xs text-white/60">
                    Events: {w.eventTypes.join(", ")} ·{" "}
                    {w.isEnabled ? (
                      <span className="text-emerald-400">Enabled</span>
                    ) : (
                      <span className="text-zinc-400">Disabled</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={togglingId === w.id}
                    onClick={() => void handleToggle(w)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    {togglingId === w.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5" />
                    )}
                    {w.isEnabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === w.id}
                    onClick={() => void handleDelete(w.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {deletingId === w.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {canLoadDeliveries ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">Delivery log</h3>
              <div className="flex items-center gap-2">
                <label htmlFor="ow-del-filter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="ow-del-filter"
                  value={deliveryFilter}
                  onChange={(e) =>
                    setDeliveryFilter(e.target.value as "all" | "success" | "failed")
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
                >
                  <option value="all">All</option>
                  <option value="success">OK</option>
                  <option value="failed">Failed (DLQ)</option>
                </select>
                <button
                  type="button"
                  onClick={() => void refetchDeliveries()}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-white/60 hover:bg-white/[0.04]"
                >
                  Refresh
                </button>
              </div>
            </div>
            <p className="text-xs text-white/60">
              One row per HTTP attempt. Non-2xx and network errors count as failed; use{" "}
              <span className="text-[var(--text)]">Retry</span> to send the stored payload again
              (same HMAC style as a fresh delivery; <code className="text-[10px]">sent_at</code> is
              new).
            </p>
            {deliveryLoading ? (
              <p className="text-xs text-white/60">Loading deliveries…</p>
            ) : deliveryError ? (
              <p className="text-sm text-red-400">{deliveryError}</p>
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-white/60">No delivery attempts in this view yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/50">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)]/50 last:border-0">
                        <td className="px-3 py-2 text-white/60">
                          {new Date(d.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[var(--text)]">
                          {d.eventType}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-2 text-white/60"
                          title={d.hookName ?? d.targetUrl ?? ""}
                        >
                          {d.hookName?.trim() || d.targetUrl || d.outboundWebhookId}
                        </td>
                        <td className="px-3 py-2">
                          {d.deliveryStatus === "success" ? (
                            <span className="text-emerald-400">{d.httpStatus ?? "2xx"}</span>
                          ) : (
                            <span className="text-red-300" title={d.errorMessage ?? ""}>
                              {d.errorMessage
                                ? d.errorMessage.length > 40
                                  ? `${d.errorMessage.slice(0, 40)}…`
                                  : d.errorMessage
                                : "error"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-white/60">
                          {d.replayOf ? "↳" : "·"}
                          {d.attemptNumber}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {d.deliveryStatus === "failed" ? (
                            <button
                              type="button"
                              disabled={replayingId === d.id}
                              onClick={() => void handleReplayDelivery(d.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text)] hover:bg-white/[0.04] disabled:opacity-50"
                            >
                              {replayingId === d.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Retry
                            </button>
                          ) : (
                            <span className="text-[10px] text-white/60">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-6">
            <h3 className="text-sm font-semibold text-[var(--text)]">Add endpoint</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="ow-url" className="mb-1 block text-xs text-white/60">
                  Target URL (HTTPS)
                </label>
                <input
                  id="ow-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://api.example.com/tigerhire-events"
                  className="w-full card-lifted px-3 py-2 text-sm text-[var(--text)]"
                />
              </div>
              <div>
                <label htmlFor="ow-name" className="mb-1 block text-xs text-white/60">
                  Label (optional)
                </label>
                <input
                  id="ow-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. SIEM or ATS bridge"
                  className="w-full card-lifted px-3 py-2 text-sm text-[var(--text)]"
                />
              </div>
              <div>
                <label htmlFor="ow-events" className="mb-1 block text-xs text-white/60">
                  Event types
                </label>
                <input
                  id="ow-events"
                  type="text"
                  value={newEventTypes}
                  onChange={(e) => setNewEventTypes(e.target.value)}
                  placeholder="*  or  application.submitted, offer.signed"
                  className="w-full card-lifted px-3 py-2 text-sm font-mono text-[var(--text)]"
                />
              </div>
            </div>
            <p className="text-xs text-white/60">
              Use <code className="text-white/60">*</code> for all configured events, or list event
              names separated by spaces or commas (see OpenAPI for emitted names).
            </p>
            <button
              type="button"
              disabled={adding}
              onClick={() => void handleAdd()}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? "Adding…" : "Add webhook"}
            </button>
          </div>
        ) : null}
      </div>
    </SettingsModule>
  );
}
