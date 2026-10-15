"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Error boundary for the apply flow. If the apply page or a child throws,
 * this catches it so the whole app does not break. Production shows a generic message.
 */
export default function ApplyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Apply flow error:", error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "development"
      ? error.message || "An unexpected error occurred."
      : "Something went wrong while loading the application form. Please try again or use a different browser.";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-8 backdrop-blur-sm">
        <AlertCircle size={48} className="text-amber-400" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-[var(--text)]">Something went wrong</h1>
        <p className="mt-2 max-w-md text-center text-sm text-[var(--text-muted)]">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
