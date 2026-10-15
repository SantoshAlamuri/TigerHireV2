"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "development"
      ? error.message || "An unexpected error occurred."
      : "Something went wrong. Please try again or contact support if the problem continues.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <div className="flex flex-col items-center card-lifted p-8 backdrop-blur-md">
        <AlertCircle size={48} className="text-amber-400" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-[var(--text)]">Something went wrong</h1>
        <p className="mt-2 max-w-md text-center text-sm text-white/60">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Try again
          </button>
          <Link
            href="/login"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
