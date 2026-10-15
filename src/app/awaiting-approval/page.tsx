import Link from "next/link";
import TigerHireLogo from "@/components/TigerHireLogo";

export default function AwaitingApprovalPage() {
  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 shadow-xl backdrop-blur-sm">
        <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
        <h1 className="heading-section mt-6 text-2xl text-[var(--text)]">Approval pending</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your SSO sign-in worked, but your company admin still needs to assign your role before you
          can access TigerHire.
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Once approved, sign in again from the login page.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="block rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            Return to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
