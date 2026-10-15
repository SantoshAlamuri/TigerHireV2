"use client";

import { useMemo } from "react";

type BannerState = { kind: "local" } | { kind: "vercel"; env: string; branch: string };

/**
 * Small corner badge for non-production — visible without blocking the layout.
 * - Local `npm run dev`: NODE_ENV is development.
 * - Vercel preview / non-production project: NEXT_PUBLIC_VERCEL_ENV.
 */
export function DevBanner() {
  const badge = useMemo<BannerState | null>(() => {
    if (process.env.NODE_ENV === "development") {
      return { kind: "local" };
    }
    const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
    if (vercelEnv && vercelEnv !== "production") {
      return {
        kind: "vercel",
        env: vercelEnv,
        branch: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? "",
      };
    }
    return null;
  }, []);

  if (!badge) return null;

  if (badge.kind === "local") {
    return (
      <div
        className="pointer-events-none fixed right-2 top-2 z-[9999] rounded-md border border-emerald-600/35 bg-emerald-950/85 px-2 py-0.5 text-[11px] font-medium text-emerald-50 shadow-sm backdrop-blur-sm"
        role="status"
        aria-label="Local development"
      >
        Local
      </div>
    );
  }

  const label = badge.env === "preview" ? "Preview" : "Dev";
  const title = [label, badge.branch].filter(Boolean).join(" · ");

  return (
    <div
      className="pointer-events-none fixed right-2 top-2 z-[9999] rounded-md border border-amber-600/40 bg-amber-100/90 px-2 py-0.5 text-[11px] font-medium text-amber-950 shadow-sm backdrop-blur-sm dark:border-amber-500/35 dark:bg-amber-950/85 dark:text-amber-50"
      role="status"
      title={title}
      aria-label={title}
    >
      {label}
    </div>
  );
}
