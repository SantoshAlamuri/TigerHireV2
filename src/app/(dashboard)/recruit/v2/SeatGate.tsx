"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { capabilitiesFor, type Capabilities } from "@/lib/v2/seat-capabilities";

/**
 * Renders its children only for a seat that holds the named capability.
 *
 * Route policy used to be the only thing standing between an agency and the
 * client's candidate database, talent pool and Hiring Setup: those screens did
 * no role check of their own, so a single line in the policy table was the
 * whole boundary. One edit away from an external partner reading everything —
 * which is exactly the shape of the leak found on 2026-07-30.
 *
 * So every screen in this tree decides for itself. Route policy stays as the
 * outer wall; this is the inner one, and either alone is enough to keep a
 * partner out.
 *
 * Deliberately not a redirect: a partner who followed a stale link should be
 * told what happened, not bounced to a page that looks like a bug.
 */
export function SeatGate({
  need,
  children,
  what,
}: {
  need: keyof Capabilities;
  children: React.ReactNode;
  /** What is being withheld, named plainly in the refusal. */
  what: string;
}) {
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);

  if (!caps[need]) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-xl font-bold text-[var(--text)]">Not your seat</h1>
        <p className="mt-2 text-sm text-white/60">
          {what} belongs to the hiring team. Your seat sees the jobs you work on and the candidates
          you submitted to them.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
