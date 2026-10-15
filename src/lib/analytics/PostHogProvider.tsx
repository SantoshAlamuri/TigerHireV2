"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const COOKIE_CONSENT_KEY = "tigerhire_cookie_consent";
const DEV_SW_RESET_KEY = "tigerhire_dev_sw_reset_v2";

let initialized = false;
let initPromise: Promise<void> | null = null;

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "all";
  } catch {
    return false;
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isLocalDev =
      process.env.NODE_ENV === "development" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    if (!isLocalDev || !("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = typeof window.caches === "undefined" ? [] : await window.caches.keys();

      if (registrations.length === 0 && cacheKeys.length === 0) return;

      await Promise.all(registrations.map((registration) => registration.unregister()));
      await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));

      if (window.sessionStorage.getItem(DEV_SW_RESET_KEY) === "done") return;

      window.sessionStorage.setItem(DEV_SW_RESET_KEY, "done");
      window.location.reload();
    })().catch(() => null);
  }, []);

  // Single effect: defer load until after hydration, then init only when consent is "all", sync user (avoids race)
  // Also listens for consent change (e.g. user clicks "Accept all" in banner)
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return;

    const ensureInit = (): Promise<void> => {
      if (!hasAnalyticsConsent()) return Promise.resolve();
      if (initialized) return Promise.resolve();
      if (initPromise) return initPromise;
      initPromise = import("posthog-js").then(({ default: posthog }) => {
        if (initialized) return;
        posthog.init(POSTHOG_KEY!, {
          api_host: POSTHOG_HOST,
          person_profiles: "identified_only",
          capture_pageview: true,
          capture_pageleave: true,
        });
        initialized = true;
      });
      return initPromise;
    };

    const initAndSync = () => {
      void ensureInit().then(() => {
        if (!initialized) return;
        void import("posthog-js").then(({ default: posthog }) => {
          if (user) {
            posthog.identify(user.id, {
              email: user.email,
              name: user.name,
              role: user.role,
              organisationId: user.organisationId,
            });
          } else {
            posthog.reset();
          }
        });
      });
    };

    const t = setTimeout(initAndSync, 0);
    const onConsent = () => initAndSync();
    window.addEventListener("tigerhire_cookie_consent", onConsent);

    return () => {
      clearTimeout(t);
      window.removeEventListener("tigerhire_cookie_consent", onConsent);
    };
  }, [user]);

  return <>{children}</>;
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.capture(event, properties);
  });
}
