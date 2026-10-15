"use client";

import type { IntegrationStatus } from "@/features/settings/types";

const STYLES: Record<IntegrationStatus, string> = {
  connected: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  disconnected: "bg-slate-500/15 text-slate-300 border-slate-500/25",
  error: "bg-red-500/15 text-red-300 border-red-500/25",
};

export function StatusPill({ status }: { status: IntegrationStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
