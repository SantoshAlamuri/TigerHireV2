import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";

export default function HomeClosingSection() {
  return (
    <section className="relative overflow-hidden py-32">
      <div
        className="mesh-orb mesh-orb-2 left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 bg-amber-500/[0.06]"
        aria-hidden
      />
      <ScrollReveal>
        <div className="card-lifted-marketing relative mx-auto max-w-4xl px-6 py-16 text-center md:px-10 lg:px-12">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-55" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            Final decision
          </p>
          <h2 className="heading-display mt-4 text-4xl md:text-6xl">
            <span className="heading-display-light text-white/60">Stop guessing.</span>{" "}
            <span className="text-white">Start knowing.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-white/70">
            Align recruiters, hiring managers, and leadership on one defensible decision framework.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center">
            <Link
              href="/contact"
              className="cta-bloom-lg group flex items-center gap-2 rounded-md bg-[var(--accent)] px-8 py-4 text-base font-bold text-black transition hover:bg-[var(--accent-hover)]"
            >
              Book executive walkthrough
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/45">
            <a
              href="mailto:hello@tigerhire.io"
              className="text-white/65 transition hover:text-white"
            >
              hello@tigerhire.io
            </a>{" "}
            ·{" "}
            <Link href="/about#faqs" className="text-white/65 transition hover:text-white">
              Common questions
            </Link>{" "}
            — on About
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
