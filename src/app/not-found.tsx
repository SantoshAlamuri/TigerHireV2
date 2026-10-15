import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-8 backdrop-blur-sm">
        <FileQuestion size={48} className="text-[var(--text-subtle)]" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-[var(--text)]">Page not found</h1>
        <p className="mt-2 max-w-md text-center text-sm text-[var(--text-muted)]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/"
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-black transition hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
