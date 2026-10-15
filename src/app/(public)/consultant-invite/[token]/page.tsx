"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Building2, Handshake } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useApiQuery, useApiMutation } from "@/lib/hooks/use-api";

interface InviteDetails {
  email: string;
  agencyName: string | null;
  company: { name: string };
  expiresAt: string;
}

interface AcceptResponse {
  message: string;
  companyOrganisationId: string;
  redirectTo: string;
}

export default function ConsultantInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [accepted, setAccepted] = useState(false);

  const { data, loading, error } = useApiQuery<InviteDetails>(
    token ? `/api/consultant-invites/${token}` : null,
  );

  const {
    mutate: accept,
    loading: accepting,
    error: acceptError,
  } = useApiMutation<Record<string, never>, AcceptResponse>(
    token ? `/api/consultant-invites/${token}` : "",
    "POST",
  );

  const handleAccept = async () => {
    if (!token) return;
    const result = await accept({});
    if (!result) return;
    setAccepted(true);
    setTimeout(() => router.push(result.redirectTo ?? "/agency/clients"), 1500);
  };

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--text)]">
      <div className="orb left-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
      <div className="orb bottom-1/4 right-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />

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
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              <p className="text-sm text-[var(--text-muted)]">Loading invitation…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <h1 className="text-lg font-semibold">This invitation isn&apos;t available</h1>
              <p className="text-sm text-[var(--text-muted)]">{error}</p>
              <Link
                href="/login"
                className="mt-2 text-sm text-amber-400 transition hover:text-amber-300"
              >
                Go to sign in
              </Link>
            </div>
          ) : accepted ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <h1 className="text-lg font-semibold">You&apos;re connected</h1>
              <p className="text-sm text-[var(--text-muted)]">
                {data?.company.name} is now one of your clients. Taking you there…
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-full border border-amber-500/30 bg-amber-500/10 p-3">
                  <Handshake className="h-6 w-6 text-amber-400" />
                </div>
                <h1 className="text-lg font-semibold">
                  {data?.company.name} invited your firm to work on their roles
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Sent to <span className="text-[var(--text)]">{data?.email}</span>
                </p>
              </div>

              <div className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4 text-sm">
                <div className="flex gap-3">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <p className="text-[var(--text-muted)]">
                    You&apos;ll see {data?.company.name}&apos;s open roles and the candidates you
                    submit for them.
                  </p>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <p className="text-[var(--text-muted)]">
                    Your firm keeps its own workspace, team and candidate pool — none of it is
                    shared with {data?.company.name}.
                  </p>
                </div>
              </div>

              {acceptError ? (
                <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {acceptError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-amber-400 disabled:opacity-50"
              >
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accept invitation
              </button>

              <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
                Sign in with your firm&apos;s TigerHire account first.{" "}
                <Link href="/register" className="text-amber-400 hover:text-amber-300">
                  Don&apos;t have one?
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
