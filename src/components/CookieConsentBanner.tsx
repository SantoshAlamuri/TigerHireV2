"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/PostHogProvider";

const STORAGE_KEY = "tigerhire_cookie_consent";

type ConsentValue = "all" | "essential" | null;

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentValue>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === "all" || raw === "essential") setConsent(raw as ConsentValue);
        else setConsent(null);
      } catch {
        setConsent(null);
      }
      setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function save(value: ConsentValue) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ?? "essential");
      setConsent(value);
      if (value === "all") {
        window.dispatchEvent(new CustomEvent("tigerhire_cookie_consent", { detail: "all" }));
        // After consent, PostHog init runs on the custom event; defer so capture runs on an initialized client.
        window.setTimeout(() => {
          trackEvent("cookie_consent_accepted", { scope: "all" });
        }, 0);
      }
    } catch {
      setConsent(value);
    }
  }

  if (!mounted || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] md:px-6 md:py-4"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-body text-sm text-[var(--text)]">
          We use cookies and similar technologies to run the platform, analyse usage and support
          marketing. By continuing you agree to our{" "}
          <Link
            href="/privacy"
            className="font-medium text-[var(--accent)] underline hover:text-[var(--accent-hover)]"
          >
            Privacy Policy
          </Link>
          . You can change your preferences anytime.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => save("essential")}
            className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => save("all")}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
