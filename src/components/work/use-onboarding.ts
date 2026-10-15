"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";

/**
 * Hints dismissed in this tab, so every screen agrees the moment someone
 * finishes, without waiting for the cached server copy to refresh.
 */
const local = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useOnboardingHints() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  const { data, loading } = useApiQuery<{ hints: string[] }>("/api/me/dismiss-hint");
  const hints = [...(data?.hints ?? []), ...local];

  const dismiss = useCallback(async (hint: string) => {
    if (!local.has(hint)) {
      local.add(hint);
      version += 1;
      listeners.forEach((fn) => fn());
    }
    await fetch("/api/me/dismiss-hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ hint }),
    }).catch(() => null);
  }, []);

  // `ready` only when the server answered: a failed load must never trap someone in onboarding.
  return { hints, ready: Boolean(data), loading: loading && !data, dismiss };
}
