"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Link2, LogIn, UserPlus } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";

const REFERRER_ONBOARD_PATH = "/dashboard/referrer/join";

function loginToReferHref(): string {
  return `/login?returnTo=${encodeURIComponent(REFERRER_ONBOARD_PATH)}`;
}

function ReferEarnMarketingSection({
  referJoinUrl,
  referDashboardUrl,
  showIntro = true,
}: {
  referJoinUrl: string;
  referDashboardUrl: string;
  /** When false, only cards + CTAs (e.g. dedicated page already has a hero). */
  showIntro?: boolean;
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      {showIntro && (
        <ScrollReveal>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Refer &amp; earn
            </span>
            <h2 className="heading-display mt-4 text-3xl md:text-4xl lg:text-5xl">
              <span className="heading-display-light text-white/60">Refer great people.</span>{" "}
              <span className="text-white">Earn real money.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-white/70">
              Use the same TigerHire account you apply with. Sign in, set up your referrer profile
              once, then share job links from your dashboard. When someone applies through your
              link, you can follow their progress — and refer the next person the same way.
            </p>
          </div>
        </ScrollReveal>
      )}

      <div className={`grid gap-4 sm:grid-cols-3 ${showIntro ? "mt-10" : "mt-0"}`}>
        <ScrollReveal delay={100} className="h-full">
          <ReferEarnCard
            icon={<LogIn size={18} strokeWidth={2} aria-hidden />}
            title="Sign in and profile"
            description="Log in (or register), add your referrer details, and verify WhatsApp. One profile for referring and for applying to jobs."
          />
        </ScrollReveal>
        <ScrollReveal delay={200} className="h-full">
          <ReferEarnCard
            icon={<Link2 size={18} strokeWidth={2} aria-hidden />}
            title="Share a job link"
            description="Each role has its own link so credit stays clear. Use your company invite once to pick jobs; after that, copy links from your referrer dashboard whenever you need them."
          />
        </ScrollReveal>
        <ScrollReveal delay={300} className="h-full">
          <ReferEarnCard
            icon={<UserPlus size={18} strokeWidth={2} aria-hidden />}
            title="They apply — you track"
            description="If they apply, you see them on your dashboard. If not, send your link to someone else — every new person uses the same flow."
          />
        </ScrollReveal>
      </div>

      {showIntro ? (
        <ScrollReveal delay={400}>
          <div className="mt-8 text-center">
            <Link
              href="/refer"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-6 py-3 text-sm font-bold text-black cta-bloom transition hover:bg-[var(--accent-hover)]"
            >
              Learn how referring works <ArrowRight size={14} />
            </Link>
          </div>
        </ScrollReveal>
      ) : (
        <ScrollReveal delay={400}>
          <div className="mt-10 flex flex-col items-center gap-5 text-center">
            <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href={loginToReferHref()}
                className="cta-bloom-lg group inline-flex flex-1 items-center justify-center gap-2.5 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Sign in to refer
                <ArrowRight
                  size={17}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/register"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                Create account
              </Link>
            </div>
            <p className="max-w-lg text-xs leading-relaxed text-white/45">
              After sign-in you&apos;ll finish referrer onboarding (name, WhatsApp, how you refer).
              Then open <span className="font-medium text-white/65">Referrer</span> in your
              dashboard to copy links and see who applied.
            </p>
            <p className="max-w-lg text-xs leading-relaxed text-white/45">
              <a
                href={referJoinUrl}
                className="font-medium text-white/65 underline-offset-4 transition hover:text-white hover:underline"
              >
                Have a company invite link?
              </a>{" "}
              Open it to pick jobs and create links in the browser — then sign in with the same
              email to tie everything to your dashboard.
            </p>
            <p className="text-sm text-white/45">
              <a
                href={referDashboardUrl}
                className="font-medium text-white/65 underline-offset-4 transition hover:text-white hover:underline"
              >
                Already set up? Sign in to your referrer dashboard →
              </a>
            </p>
          </div>
        </ScrollReveal>
      )}
    </section>
  );
}

function ReferEarnCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card-lifted-marketing card-lifted-marketing-hover h-full p-6">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
        {icon}
      </span>
      <h3 className="heading-card mt-3 text-sm text-white">{title}</h3>
      <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/55">{description}</p>
    </div>
  );
}

export default ReferEarnMarketingSection;
