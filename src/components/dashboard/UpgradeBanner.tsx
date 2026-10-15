"use client";

import { Check } from "lucide-react";
import Link from "next/link";

interface UpgradeBannerProps {
  currentTier: string;
  targetTier: string;
  features: string[];
  ctaHref?: string;
}

export default function UpgradeBanner({
  currentTier,
  targetTier,
  features,
  ctaHref = "/pricing",
}: UpgradeBannerProps) {
  return (
    <div className="upgrade-banner-glow relative overflow-hidden rounded-2xl bg-[var(--surface)]/60 p-6 backdrop-blur-sm">
      <div className="relative z-10">
        <h3 className="heading-card text-xl text-[var(--text)]">Upgrade to {targetTier}</h3>
        <p className="text-body mt-1 text-sm text-[var(--text-muted)]">
          You&apos;re on {currentTier}. Unlock more with {targetTier}.
        </p>
        <ul className="mt-4 space-y-2">
          {features.map((feature, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-body text-sm text-[var(--text-muted)]"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
                <Check size={12} strokeWidth={2.5} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <Link
          href={ctaHref}
          className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
        >
          Upgrade now
        </Link>
      </div>
    </div>
  );
}
