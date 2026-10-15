"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";

/** In-memory cache for GET requests: deduplicates and avoids refetch on remount. */
type QueryCacheEntry = { data: unknown; error: string | null; at: number };
type QueryResult = { data: unknown; error: string | null };
type ApiQueryGlobalStore = typeof globalThis & {
  __tigerhireQueryCache?: Map<string, QueryCacheEntry>;
  __tigerhireInFlight?: Map<string, Promise<QueryResult>>;
};

const apiQueryGlobalStore = globalThis as ApiQueryGlobalStore;
const queryCache =
  apiQueryGlobalStore.__tigerhireQueryCache ??
  (apiQueryGlobalStore.__tigerhireQueryCache = new Map<string, QueryCacheEntry>());
const inFlight =
  apiQueryGlobalStore.__tigerhireInFlight ??
  (apiQueryGlobalStore.__tigerhireInFlight = new Map<string, Promise<QueryResult>>());
const CACHE_TTL_MS = 60_000; // 60s
const PERSISTED_QUERY_CACHE_PREFIX = "tigerhire.queryCache.";

function isFresh(entry: QueryCacheEntry, cacheTtlMs: number): boolean {
  return Date.now() - entry.at < cacheTtlMs;
}

function readPersistedCacheEntry(cacheKey: string, cacheTtlMs: number): QueryCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${PERSISTED_QUERY_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueryCacheEntry;
    if (
      typeof parsed?.at !== "number" ||
      !("data" in parsed) ||
      !("error" in parsed) ||
      !isFresh(parsed, cacheTtlMs)
    ) {
      window.sessionStorage.removeItem(`${PERSISTED_QUERY_CACHE_PREFIX}${cacheKey}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedCacheEntry(cacheKey: string, entry: QueryCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${PERSISTED_QUERY_CACHE_PREFIX}${cacheKey}`,
      JSON.stringify(entry),
    );
  } catch {
    /* storage unavailable/full */
  }
}

function removePersistedCacheEntry(cacheKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${PERSISTED_QUERY_CACHE_PREFIX}${cacheKey}`);
  } catch {
    /* ignore storage errors */
  }
}

function getFreshCacheEntry(
  cacheKey: string,
  cacheTtlMs: number,
  persistToSessionStorage: boolean,
): QueryCacheEntry | null {
  const memoryEntry = queryCache.get(cacheKey);
  if (memoryEntry && isFresh(memoryEntry, cacheTtlMs)) return memoryEntry;
  if (!persistToSessionStorage) return null;
  const persistedEntry = readPersistedCacheEntry(cacheKey, cacheTtlMs);
  if (persistedEntry) {
    queryCache.set(cacheKey, persistedEntry);
  }
  return persistedEntry;
}

function getCacheKey(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return url;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  return qs ? `${url}?${qs}` : url;
}

export type ApiQueryRefetchOptions = {
  /** When true, refresh data without setting loading (avoids full-page spinners on mutations). */
  silent?: boolean;
};

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (opts?: ApiQueryRefetchOptions) => Promise<void>;
  /** Merge into cached + React state without a network round-trip (e.g. after a mutation). */
  mergeData: (updater: (prev: T | null) => T) => void;
}

interface UseApiQueryOptions {
  cacheTtlMs?: number;
  persistToSessionStorage?: boolean;
}

export function useApiQuery<T>(
  url: string | null,
  params?: Record<string, string | number | boolean | undefined>,
  options?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const cacheTtlMs = options?.cacheTtlMs ?? CACHE_TTL_MS;
  const persistToSessionStorage = options?.persistToSessionStorage === true;
  // Compute cacheKey - this will change when url or params values change
  const cacheKey = url ? getCacheKey(url, params) : "";
  const [data, setData] = useState<T | null>(() => {
    if (!cacheKey) return null;
    const hit = getFreshCacheEntry(cacheKey, cacheTtlMs, persistToSessionStorage);
    if (hit) return hit.data as T;
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (!cacheKey) return false;
    const hit = getFreshCacheEntry(cacheKey, cacheTtlMs, persistToSessionStorage);
    return !hit;
  });
  const [error, setError] = useState<string | null>(() => {
    if (!cacheKey) return null;
    const hit = getFreshCacheEntry(cacheKey, cacheTtlMs, persistToSessionStorage);
    return hit?.error ?? null;
  });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const activeKeyRef = useRef(cacheKey);
  const requestSequenceRef = useRef(0);
  useLayoutEffect(() => {
    activeKeyRef.current = cacheKey;
  }, [cacheKey]);

  const fetchData = useCallback(
    async (skipCache = false, refetchOpts?: ApiQueryRefetchOptions) => {
      if (!url) {
        setLoading(false);
        return;
      }

      const requestSequence = ++requestSequenceRef.current;
      const silent = refetchOpts?.silent === true;

      if (skipCache) {
        queryCache.delete(cacheKey);
        inFlight.delete(cacheKey);
        if (persistToSessionStorage) removePersistedCacheEntry(cacheKey);
      }

      mountedRef.current = true;

      const fullUrl = cacheKey;

      // Reuse in-flight request for the same key WITHOUT aborting -- avoids
      // React strict-mode double-effect killing the shared promise.
      let promise = inFlight.get(fullUrl);
      if (!promise) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        // Only the request still registered for this key may publish cache state.
        // Refetch/invalidation can replace it while the old network response is pending.
        const publishCache = (entry: QueryCacheEntry) => {
          if (inFlight.get(fullUrl) !== promise) return;
          queryCache.set(fullUrl, entry);
          if (persistToSessionStorage) writePersistedCacheEntry(fullUrl, entry);
        };
        promise = (async () => {
          try {
            const res = await fetch(fullUrl, {
              credentials: "include",
              signal: controller.signal,
              cache: "no-store", // ensure refetch (e.g. after rerun) gets fresh data
            });
            const text = await res.text();
            let json: unknown;
            try {
              json = text.length > 0 ? JSON.parse(text) : {};
            } catch {
              const err =
                !res.ok && text.trimStart().startsWith("<")
                  ? "Server returned an error page. Try signing in again or refresh the page."
                  : "Invalid response from server. Please try again.";
              publishCache({ data: null, error: err, at: Date.now() });
              return { data: null, error: err };
            }
            if (!res.ok) {
              const err = (json as { error?: string })?.error ?? `Request failed (${res.status})`;
              const entry = {
                data: null,
                error: err,
                at: Date.now(),
              };
              publishCache(entry);
              return { data: null, error: err };
            }
            const entry = {
              data: json,
              error: null,
              at: Date.now(),
            };
            publishCache(entry);
            return { data: json, error: null };
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              return { data: null, error: null };
            }
            const message = err instanceof Error ? err.message : "An unexpected error occurred";
            const entry = {
              data: null,
              error: message,
              at: Date.now(),
            };
            publishCache(entry);
            return { data: null, error: message };
          } finally {
            if (inFlight.get(fullUrl) === promise) inFlight.delete(fullUrl);
          }
        })();
        inFlight.set(fullUrl, promise);
      }

      if (!silent) {
        setLoading(true);
      }
      setError(null);

      const result = await promise;
      if (
        mountedRef.current &&
        activeKeyRef.current === fullUrl &&
        requestSequence === requestSequenceRef.current
      ) {
        setData(result.data as T);
        setError(result.error);
        // Silent only controls whether starting a refresh shows a spinner.
        // Its completion must also settle an earlier visible request it superseded.
        setLoading(false);
      }
    },
    [url, cacheKey, persistToSessionStorage],
  );

  const refetch = useCallback(
    (opts?: ApiQueryRefetchOptions) => fetchData(true, opts),
    [fetchData],
  );

  const mergeData = useCallback(
    (updater: (prev: T | null) => T) => {
      if (!cacheKey) return;
      setData((prev) => {
        const next = updater(prev);
        const entry = { data: next, error: null, at: Date.now() };
        queryCache.set(cacheKey, entry);
        if (persistToSessionStorage) writePersistedCacheEntry(cacheKey, entry);
        return next;
      });
      setError(null);
    },
    [cacheKey, persistToSessionStorage],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!url) {
      queueMicrotask(() => {
        if (mountedRef.current && activeKeyRef.current === cacheKey) {
          setLoading(false);
          setData(null);
          setError(null);
        }
      });
      return;
    }

    // Always check cache first, but if cacheKey changed, we need fresh data
    const hit = getFreshCacheEntry(cacheKey, cacheTtlMs, persistToSessionStorage);
    if (hit) {
      queueMicrotask(() => {
        if (mountedRef.current && activeKeyRef.current === cacheKey) {
          setData(hit.data as T);
          setError(hit.error);
          setLoading(false);
        }
      });
      return;
    }
    // If no valid cache, fetch fresh data
    queueMicrotask(() => {
      if (mountedRef.current && activeKeyRef.current === cacheKey) {
        void fetchData();
      }
    });
    return () => {
      mountedRef.current = false;
      // Only abort if no other subscriber is sharing the inflight promise.
      // In React strict mode, cleanup fires between double-invoked effects;
      // aborting here would kill the shared promise the next effect reuses.
      if (!inFlight.has(cacheKey)) {
        abortRef.current?.abort();
      }
    };
  }, [url, cacheKey, fetchData, cacheTtlMs, persistToSessionStorage]);

  return { data, loading, error, refetch, mergeData };
}

/**
 * Invalidate cached queries by URL prefix.
 * Call after mutations to ensure stale data is refetched.
 * Pass an exact URL or a prefix — any cache key starting with it will be evicted (including
 * `GET /api/hiring-requests?status=…` variants, so company and recruit lists refetch together).
 */
export function invalidateQueries(urlPrefix: string): void {
  for (const key of queryCache.keys()) {
    if (key === urlPrefix || key.startsWith(urlPrefix + "?") || key.startsWith(urlPrefix + "/")) {
      queryCache.delete(key);
      inFlight.delete(key);
      removePersistedCacheEntry(key);
    }
  }
}

interface UseApiMutationResult<TInput, TOutput> {
  mutate: (data: TInput) => Promise<TOutput | null>;
  loading: boolean;
  error: string | null;
}

interface UseOptimisticMutationOptions<TResponse, TVariables> {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  onMutate?: (variables: TVariables) => () => void;
  onSuccess?: (response: TResponse, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, rollback: () => void) => void;
}

export function useApiMutation<TInput, TOutput = unknown>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): UseApiMutationResult<TInput, TOutput> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body: TInput): Promise<TOutput | null> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });

        const text = await res.text();
        let json: unknown;
        try {
          json = text.length > 0 ? JSON.parse(text) : {};
        } catch {
          setError(
            !res.ok && text.trimStart().startsWith("<")
              ? "Server returned an error page. Try signing in again."
              : "Invalid response from server.",
          );
          return null;
        }

        if (!res.ok) {
          setError((json as { error?: string })?.error ?? `Request failed (${res.status})`);
          return null;
        }

        return json as TOutput;
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [url, method],
  );

  return { mutate, loading, error };
}

export function useOptimisticMutation<TResponse, TVariables>(
  endpoint: string,
  options?: UseOptimisticMutationOptions<TResponse, TVariables>,
): UseApiMutationResult<TVariables, TResponse> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TResponse | null> => {
      setLoading(true);
      setError(null);

      let rollback = () => {};
      if (options?.onMutate) {
        rollback = options.onMutate(variables);
      }

      try {
        const res = await fetch(endpoint, {
          method: options?.method ?? "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(variables),
          credentials: "include",
        });

        const text = await res.text();
        let json: unknown;
        try {
          json = text.length > 0 ? JSON.parse(text) : {};
        } catch {
          throw new Error(
            !res.ok && text.trimStart().startsWith("<")
              ? "Server returned an error page. Try signing in again."
              : "Invalid response from server.",
          );
        }

        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Request failed (${res.status})`);
        }

        const response = json as TResponse;
        options?.onSuccess?.(response, variables);
        return response;
      } catch (err) {
        const parsed = err instanceof Error ? err : new Error("An unexpected error occurred");
        rollback();
        setError(parsed.message);
        options?.onError?.(parsed, variables, rollback);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, options],
  );

  return { mutate, loading, error };
}
