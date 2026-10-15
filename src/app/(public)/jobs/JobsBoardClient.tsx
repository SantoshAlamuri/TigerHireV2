"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle, Sparkles, ShieldCheck } from "lucide-react";
import { PublicJobsResults } from "./PublicJobsResults";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";

export function JobsBoardClient() {
  const whatsappApplyUrl = getPublicWhatsAppChatUrl(publicWhatsAppPrefill.candidateApply);

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/10 px-5 py-32 lg:px-8 lg:py-40">
        <div
          className="mesh-orb mesh-orb-1 left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 bg-amber-500/[0.05]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-10 md:grid-cols-[1.35fr_1fr] md:items-start md:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/75">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Open roles · fair screening
              </span>
              <h1 className="heading-display mt-6 text-5xl md:text-6xl lg:text-7xl">
                <span className="heading-display-light text-white/55">Find a role where</span>
                <br />
                <span className="text-white">your CV actually gets read.</span>
              </h1>
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-white/70 md:text-2xl">
                Every company here has pre-agreed what a great hire looks like. You get a clear
                FitScore for each role with plain-English reasons — no black box, no silent
                ghosting.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="cta-bloom-lg inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Create account
                  <ArrowRight size={15} aria-hidden />
                </Link>
                <a
                  href={whatsappApplyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  <MessageCircle size={16} className="text-emerald-400" aria-hidden />
                  Apply on WhatsApp
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </a>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-8 py-4 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  Log in
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} aria-hidden />
                  One scoring bar per role
                </span>
                <span className="hidden h-3 w-px bg-white/15 sm:inline-block" aria-hidden />
                <span>No logins to apply via WhatsApp</span>
                <span className="hidden h-3 w-px bg-white/15 sm:inline-block" aria-hidden />
                <span>Free for candidates, always</span>
              </div>
            </div>

            <aside className="card-lifted-marketing p-5 md:p-6">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                How applying works
              </p>
              <ol className="mt-4 space-y-4">
                {[
                  {
                    step: "1",
                    title: "Send your CV",
                    body: "Tap WhatsApp or upload on the apply page. Your profile is parsed and scored when processing completes.",
                  },
                  {
                    step: "2",
                    title: "See how you fit",
                    body: "Get a FitScore per role with a plain-English reason — what matched, what's missing.",
                  },
                  {
                    step: "3",
                    title: "Move forward",
                    body: "Reply to apply, pick interview slots, and track every application in one place.",
                  },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs font-semibold text-white ring-1 ring-inset ring-white/[0.08]">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-0.5 text-[0.8rem] leading-relaxed text-white/55">
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>
      </section>

      <PublicJobsResults />
    </>
  );
}
