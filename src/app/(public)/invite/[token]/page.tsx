"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Building2, UserPlus } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useApiQuery, useApiMutation } from "@/lib/hooks/use-api";
import { ROLE_DASHBOARD_PATH, ROLE_LABELS } from "@/types";
import type { UserRole } from "@/types";

interface InviteDetails {
  email: string;
  role: string;
  organisation: { id?: string; name: string };
}

interface AcceptResponse {
  message: string;
  role: string;
  organisationId: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [accepted, setAccepted] = useState(false);

  const { data, loading, error } = useApiQuery<InviteDetails>(
    token ? `/api/invites/${token}` : null,
  );

  const {
    mutate: acceptInvite,
    loading: accepting,
    error: acceptError,
  } = useApiMutation<Record<string, never>, AcceptResponse>(
    token ? `/api/invites/${token}` : "",
    "POST",
  );

  const handleAccept = async () => {
    if (!token) return;
    const result = await acceptInvite({});
    if (!result) return;

    setAccepted(true);

    const path = ROLE_DASHBOARD_PATH[result.role as UserRole] ?? "/company";
    setTimeout(() => router.push(path), 1500);
  };

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--text)]">
      <div className="orb left-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
      <div className="orb right-1/4 bottom-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <header className="absolute left-0 right-0 top-0 flex justify-between px-4 py-4">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
          <Link
            href="/login"
            className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            Sign in
          </Link>
        </header>

        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-8 backdrop-blur-sm">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-[var(--accent)]" aria-hidden />
              <p className="mt-4 text-sm text-[var(--text-muted)]">Loading invitation…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center py-8 text-center">
              <AlertCircle size={40} className="text-red-400" aria-hidden />
              <h1 className="mt-4 text-xl font-bold text-[var(--text)]">
                Invalid or expired invitation
              </h1>
              <p className="mt-2 text-sm text-red-400">{error}</p>
              <Link
                href="/"
                className="mt-6 text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
              >
                Return home
              </Link>
            </div>
          )}

          {data && !loading && !error && (
            <>
              {accepted ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CheckCircle2 size={48} className="text-emerald-500" aria-hidden />
                  <h1 className="mt-4 text-xl font-bold text-[var(--text)]">
                    Welcome to the team!
                  </h1>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Redirecting you to your dashboard…
                  </p>
                  <Loader2
                    size={24}
                    className="mt-4 animate-spin text-[var(--accent)]"
                    aria-hidden
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-muted)]">
                      <UserPlus size={28} className="text-[var(--accent)]" aria-hidden />
                    </div>
                    <h1 className="mt-6 text-xl font-bold text-[var(--text)] md:text-2xl">
                      You&apos;ve been invited to join
                    </h1>
                    <p className="mt-2 text-center text-[var(--text-muted)]">
                      Join{" "}
                      <span className="font-semibold text-[var(--accent)]">
                        {data.organisation?.name ?? "the organisation"}
                      </span>{" "}
                      as a{" "}
                      <span className="font-medium text-[var(--text)]">
                        {ROLE_LABELS[data.role as UserRole] ?? data.role.replace(/_/g, " ")}
                      </span>
                    </p>
                    <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 px-4 py-3">
                      <Building2 size={18} className="text-[var(--text-muted)]" aria-hidden />
                      <span className="text-sm text-[var(--text-muted)]">
                        Invitation sent to{" "}
                        <span className="font-medium text-[var(--text)]">{data.email}</span>
                      </span>
                    </div>
                  </div>

                  {acceptError && (
                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                      <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
                      <div className="flex-1">
                        <p className="text-sm text-red-400">{acceptError}</p>
                        {acceptError.toLowerCase().includes("logged in") && (
                          <Link
                            href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                            className="mt-2 inline-block text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                          >
                            Sign in to accept
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="mt-8 w-full rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {accepting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={18} className="animate-spin" />
                        Accepting…
                      </span>
                    ) : (
                      "Accept Invitation"
                    )}
                  </button>

                  <p className="mt-4 text-center text-xs text-[var(--text-subtle)]">
                    Sign in with {data.email} to accept. Don&apos;t have an account?{" "}
                    <Link
                      href={`/register?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                      className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                    >
                      Create one
                    </Link>
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
