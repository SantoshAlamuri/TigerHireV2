"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import {
  companyOnboardingTelHref,
  formatCompanyOnboardingPhone,
  getCompanyOnboardingPhoneRaw,
} from "@/lib/company/onboarding-phone";

const HINT_KEY = "company_setup_welcome";
const STORAGE_PREFIX = "th_company_setup_welcome_dismissed";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}_${userId}`;
}

function readDismissed(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

interface CompanySetupWelcomeBannerProps {
  userId: string;
}

/**
 * First-time guidance for company admins: call to complete setup.
 * Dismissal is stored per user in localStorage (per browser).
 */
export function CompanySetupWelcomeBanner({ userId }: CompanySetupWelcomeBannerProps) {
  const phoneRaw = getCompanyOnboardingPhoneRaw();
  const phoneDisplay = phoneRaw ? formatCompanyOnboardingPhone(phoneRaw) : null;
  const phoneLink = phoneRaw ? companyOnboardingTelHref(phoneRaw) : "";

  // Local fast-path (instant, no flash for returning users) layered over the server source of
  // truth, so a dismissal sticks across browsers/devices and survives cleared localStorage.
  const [localDismissed, setLocalDismissed] = useState(true);
  useEffect(() => {
    setLocalDismissed(readDismissed(userId));
  }, [userId]);

  const { data: hintsData, loading: hintsLoading } = useApiQuery<{ hints: string[] }>(
    "/api/me/dismiss-hint",
  );
  const serverDismissed = (hintsData?.hints ?? []).includes(HINT_KEY);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey(userId), "1");
    } catch {
      // private mode / blocked storage — server copy below is the durable record
    }
    setLocalDismissed(true);
    // Persist server-side so it never reappears, even if local storage is later cleared.
    void fetch("/api/me/dismiss-hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ hint: HINT_KEY }),
    }).catch(() => null);
  }, [userId]);

  if (localDismissed || serverDismissed) return null;
  // Wait for the server check before the first paint to avoid a show-then-hide flicker.
  if (hintsLoading) return null;

  return (
    <div
      className="relative mb-4 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 pr-12 text-sm text-[var(--text)] shadow-[0_0_24px_rgba(245,158,11,0.12)] sm:px-5 sm:py-4"
      role="region"
      aria-label="Getting started"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
        aria-label="Dismiss getting started message"
      >
        <X size={18} />
      </button>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/20 text-[var(--accent)]">
          <Phone size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-[var(--text)]">Welcome — let&apos;s get you set up</p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Before you dive in, call us once so we can activate your workspace and walk you through
            the basics. It only takes a few minutes and makes the first week much easier.
          </p>
          {phoneDisplay && phoneLink ? (
            <p className="font-medium">
              <a
                href={phoneLink}
                className="inline-flex items-center gap-1.5 text-[var(--accent)] underline decoration-[var(--accent)]/50 underline-offset-2 transition hover:decoration-[var(--accent)]"
              >
                <Phone size={14} className="shrink-0 opacity-90" aria-hidden />
                {phoneDisplay}
              </a>
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Set{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-[11px] text-white/80">
                NEXT_PUBLIC_COMPANY_ONBOARDING_PHONE
              </code>{" "}
              in your deployment to show the support number here.
            </p>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-1 inline-flex w-fit items-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/10"
          >
            I&apos;ve saved the number — hide this
          </button>
        </div>
      </div>
    </div>
  );
}
