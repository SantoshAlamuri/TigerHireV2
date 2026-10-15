"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type HealthPayload = {
  ok?: boolean;
  status?: string;
  timestamp?: string;
  [key: string]: unknown;
};

export default function StatusPage() {
  const [loading, setLoading] = useState(true);
  const [coreHealth, setCoreHealth] = useState<HealthPayload | null>(null);
  const [csrfHealth, setCsrfHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const [coreRes, csrfRes] = await Promise.all([
        fetch("/api/health", { cache: "no-store", signal: controller.signal }),
        fetch("/api/health/csrf?probe=1", { cache: "no-store", signal: controller.signal }),
      ]);
      const [core, csrf] = await Promise.all([
        coreRes.json().catch(() => ({})),
        csrfRes.json().catch(() => ({})),
      ]);
      setCoreHealth(core);
      setCsrfHealth(csrf);
      setRefreshedAt(new Date().toISOString());
      if (!coreRes.ok || !csrfRes.ok) {
        setError("One or more probes reported degraded status.");
      }
    } catch {
      setError("Unable to fetch status probes right now.");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadStatus();
    const interval = setInterval(() => {
      if (!cancelled) void loadStatus();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadStatus]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text)]">TigerHire Status</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Public health snapshot for core runtime and auth CSRF readiness.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading status…
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
            <span>
              Last refreshed:{" "}
              {refreshedAt ? new Date(refreshedAt).toLocaleString() : "Not available"}
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text)]"
            >
              <RefreshCw size={12} />
              Refresh now
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              {error}
            </div>
          ) : null}

          <section className="rounded-xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">Core API</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Status: <strong>{coreHealth?.ok ? "Operational" : "Degraded"}</strong>
            </p>
            <pre className="mt-3 overflow-auto rounded bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
              {JSON.stringify(coreHealth ?? {}, null, 2)}
            </pre>
          </section>

          <section className="rounded-xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">Auth CSRF</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Status: <strong>{csrfHealth?.ok ? "Operational" : "Degraded"}</strong>
            </p>
            <pre className="mt-3 overflow-auto rounded bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
              {JSON.stringify(csrfHealth ?? {}, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
