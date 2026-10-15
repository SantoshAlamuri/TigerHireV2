import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import styles from "@/app/(public)/v2/v2.module.css";

/**
 * v2 closing section — one primary ask (the wager), walkthrough demoted to a
 * text link. Replaces the shared HomeClosingSection on this page only.
 */
export default function ClosingV2() {
  return (
    <section id="closing" className="border-t border-[var(--border)] px-6 py-24 text-center">
      <div className="mx-auto max-w-3xl">
        <p className={`${styles.mono} text-xs uppercase tracking-[0.14em] text-[var(--accent)]`}>
          The only test that matters
        </p>
        <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
          One live role. Every CV read.
          <br />
          Your hiring manager is the judge.
        </h2>
        <p className="mx-auto mb-9 mt-4 max-w-xl text-lg text-[var(--text-muted)]">
          Ten minutes to approve the bar — the agent does the rest.
        </p>
        <div className="flex flex-col items-center gap-4">
          <Link href="/contact" className={buttonClasses("primary", "lg", "gap-2.5")}>
            Start the wager <ArrowRight size={16} />
          </Link>
          <p className="text-sm text-[var(--text-subtle)]">
            Prefer a walkthrough first?{" "}
            <Link href="/contact" className="underline hover:text-[var(--text)]">
              Book 30 minutes
            </Link>{" "}
            · <a href="mailto:hello@tigerhire.io">hello@tigerhire.io</a>
          </p>
        </div>
      </div>
    </section>
  );
}
