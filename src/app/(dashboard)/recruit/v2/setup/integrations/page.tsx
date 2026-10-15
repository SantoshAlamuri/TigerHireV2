"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { integrationsFor, statusFor } from "@/lib/v2/integrations";

/**
 * Integrations — its own tab, showing each seat only what it controls.
 *
 * Platform-managed services get exactly one control, on or off. There is no
 * key field, no endpoint box, no "advanced" section: TigerHire runs the
 * account, so pretending otherwise would only generate support tickets.
 */
export default function RecruitV2IntegrationsPage() {
  const { user } = useAuth();
  const rows = integrationsFor(user?.role);

  if (rows.length === 0) {
    return (
      <section>
        <h1 className="text-xl font-bold text-[var(--text)]">Integrations</h1>
        <p className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          Your account doesn&apos;t manage integrations.
        </p>
      </section>
    );
  }

  const platform = rows.filter((r) => r.owner === "platform");
  const customer = rows.filter((r) => r.owner === "customer");

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="flex flex-wrap items-start gap-3 border-b border-white/5 px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">{r.name}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              r.owner === "platform"
                ? "border-[var(--border)] text-white/45"
                : "border-emerald-400/30 text-emerald-300/80"
            }`}
          >
            {r.owner === "platform" ? "TigerHire-managed" : "your account"}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-white/55">{r.purpose}</span>
        {/* The design shows live health here. Nothing polls these services, so
            "Last event" says it is unknown rather than printing a time that
            would read as proof the integration is working. */}
        <span className="mt-1.5 grid gap-1 sm:grid-cols-2">
          <span className="block">
            <span className="block text-[9px] font-medium uppercase tracking-wider text-white/30">
              Last event
            </span>
            <span className="block text-[11px] text-white/35">
              Not checked here — no health poll runs against this
            </span>
          </span>
          <span className="block">
            <span className="block text-[9px] font-medium uppercase tracking-wider text-white/30">
              Detail
            </span>
            <span className="block text-[11px] text-white/35">{r.actions.note}</span>
          </span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {r.actions.canConfigure && r.manageHref ? (
          <Link
            href={r.manageHref}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-[var(--text)]"
          >
            Configure
          </Link>
        ) : null}
        {(() => {
          const st = statusFor(r.id);
          return (
            <span className="flex items-center gap-2">
              {/* No health check backs this page, so it never claims a state. */}
              <span className="whitespace-nowrap text-[11px] text-white/35">{st.label}</span>
              {st.verifyHref ? (
                <Link
                  href={st.verifyHref}
                  className="whitespace-nowrap text-[11px] font-semibold text-[var(--accent)] hover:underline"
                >
                  Check
                </Link>
              ) : null}
              {r.actions.canToggle ? (
                // No endpoint writes this yet, so the control is disabled
                // rather than looking operable and doing nothing.
                <button
                  type="button"
                  disabled
                  title="Switching services on and off isn't wired up yet"
                  className="cursor-not-allowed whitespace-nowrap rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-white/30"
                >
                  Turn off
                </button>
              ) : null}
            </span>
          );
        })()}
      </span>
    </li>
  );

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 text-xl font-bold text-[var(--text)]">Integrations</h1>
        <Link
          href="/recruit/v2/setup"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Hiring Setup
        </Link>
      </div>
      <p className="mb-5 text-sm text-white/55">
        {rows.some((r) => r.actions.canToggle)
          ? "TigerHire-run services switch on or off. Your own accounts you configure."
          : "Read-only — an account owner can change these."}{" "}
        Live status isn&apos;t reported here yet — use Check where one exists.
      </p>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
        Run by TigerHire · on/off only
      </h2>
      <ul className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {platform.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
        Your own accounts
      </h2>
      <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        {customer.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>

      <p className="mt-3 text-xs text-white/35">
        If a TigerHire-run service misbehaves, it is ours to fix — there is nothing for you to
        reconfigure.
      </p>
    </section>
  );
}
