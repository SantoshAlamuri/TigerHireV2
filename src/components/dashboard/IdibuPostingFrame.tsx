"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function IdibuPostingFrame({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/idibu/status")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled || configured === false) return null;
  if (configured === null) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-6 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Checking job board integration…
      </div>
    );
  }

  const embedSrc = `/api/idibu/embed?jobId=${encodeURIComponent(jobId)}`;

  return (
    <section
      className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4"
      aria-labelledby="idibu-posting-heading"
    >
      <h2 id="idibu-posting-heading" className="text-base font-semibold text-[var(--text)]">
        Post to Job Boards
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Distribute this role to Indeed, Foundit, LinkedIn, and other boards via idibu.
      </p>
      <iframe
        title="Post job to idibu job boards"
        src={embedSrc}
        className="mt-4 w-full rounded-lg border border-[var(--border)] bg-white"
        style={{ height: "700px" }}
        sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
      />
    </section>
  );
}
