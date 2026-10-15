"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Claim an unclaimed (apply-flow) candidate profile via a one-time token (B2.2).
 * If the visitor isn't signed in, we send them to create a candidate account and
 * return here; once authenticated the claim binds their profile and drops them
 * into onboarding (which pre-fills from the résumé they already submitted).
 */
export default function ClaimProfilePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "expired" | "invalid">("working");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/candidates/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace(
            `/register?userType=candidate&returnTo=${encodeURIComponent(`/claim/${token}`)}`,
          );
          return;
        }
        if (res.ok) {
          router.replace("/candidate/onboarding");
          return;
        }
        setState(res.status === 410 ? "expired" : "invalid");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card-lifted w-full max-w-md p-8 text-center">
        {state === "working" ? (
          <>
            <Loader2
              className="mx-auto mb-4 h-6 w-6 animate-spin text-[var(--accent)]"
              aria-hidden
            />
            <h1 className="heading-section text-xl text-[var(--text)]">Linking your profile…</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">One moment.</p>
          </>
        ) : (
          <>
            <h1 className="heading-section text-xl text-[var(--text)]">
              {state === "expired" ? "This link has expired" : "This link isn’t valid"}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {state === "expired"
                ? "Claim links last a couple of weeks. You can still create an account and we’ll match your applications by email."
                : "We couldn’t use this claim link. You can still create an account to track your applications."}
            </p>
            <Link
              href="/register?userType=candidate"
              className={`${buttonClasses("primary", "md")} mt-6`}
            >
              Create your account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
