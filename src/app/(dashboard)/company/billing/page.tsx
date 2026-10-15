"use client";

import { useState } from "react";
import { Zap, Briefcase, Unlock, Loader2, AlertCircle, Check, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbOrgToView } from "@/lib/mappers";
import { PLAN_DETAILS, PLAN_ORDER } from "@/lib/billing/plan-details";
import { useAuth } from "@/lib/auth/AuthProvider";

const TIER_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  starter:
    "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]",
  growth:
    "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]",
  scale: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  enterprise:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]",
};

export default function BillingPage() {
  const { user } = useAuth();
  const { data: orgData, loading } = useApiQuery<{
    organisation: Record<string, unknown>;
    stats: { members: number; activeJobs: number; unlocksThisMonth: number };
  }>("/api/organisations");
  const { data: jobsData } = useApiQuery<{
    jobs: unknown[];
    pagination: { total: number };
  }>("/api/jobs", { status: "open" });

  const org = orgData?.organisation ? mapDbOrgToView(orgData.organisation) : null;
  const currentTier = org?.billingTier ?? "free";
  const currentPlan = PLAN_DETAILS[currentTier] ?? PLAN_DETAILS.free;
  const tierColor = TIER_COLORS[currentTier] ?? TIER_COLORS.free;
  const activeJobsCount = jobsData?.pagination?.total ?? 0;
  const creditsUsed = org?.unlocksUsedThisMonth ?? 0;
  const creditsQuota = org?.unlockQuotaMonthly ?? 5;
  const isUnlimited = creditsQuota < 0;
  const isOutOfCredits = !isUnlimited && creditsQuota > 0 && creditsUsed >= creditsQuota;

  const currentTierIdx = PLAN_ORDER.indexOf(currentTier as (typeof PLAN_ORDER)[number]);

  // Upgrade request form state
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleUpgradeRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    setCheckoutError(null);
    const selfServePlans = new Set(["starter", "growth", "scale"]);
    try {
      if (selfServePlans.has(selectedPlan)) {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "company",
            plan: selectedPlan,
          }),
          credentials: "include",
        });
        const payload = (await response.json()) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !payload.url) {
          setCheckoutError(payload.error ?? "Unable to start checkout. Please try again.");
          return;
        }
        window.location.assign(payload.url);
        return;
      }

      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "upgrade_request",
          name: user?.name ?? "",
          email: user?.email ?? "",
          organisation: org?.name ?? "",
          currentPlan: currentTier,
          requestedPlan: selectedPlan,
          message,
        }),
        credentials: "include",
      });
      setSubmitted(true);
    } catch {
      setCheckoutError("Unable to process billing request right now. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="alive-air space-y-6">
      <PageHeader title="Billing" subtitle="Manage your subscription and usage" />
      {loading ? (
        <div className="space-y-4">
          <div className="card-lifted p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-3 h-8 w-32" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-3 w-full" />
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-6 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Current plan + usage stats */}
          <div className="card-lifted p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="heading-card text-xl text-[var(--text)]">Current Plan</h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${tierColor}`}
              >
                {currentTier}
              </span>
            </div>
            <p className="text-body mt-1 tabular-nums text-2xl font-bold text-[var(--accent)]">
              {currentPlan.price}
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {currentPlan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-body text-sm text-white/60">
                  <Check size={14} className="shrink-0 text-emerald-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {isOutOfCredits && (
            <div className="card-lifted flex flex-wrap items-center gap-4 border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
              <AlertCircle size={24} className="shrink-0 text-[var(--status-warning-fg)]" />
              <div>
                <p className="font-semibold text-[var(--text)]">Out of credits</p>
                <p className="text-sm text-white/60">
                  You&apos;ve used all {creditsQuota} profile unlock credits for this month. Pick a
                  higher plan below to unlock more.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Credits used"
              value={isUnlimited ? `${creditsUsed} / ∞` : `${creditsUsed} / ${creditsQuota}`}
              icon={<Unlock size={20} />}
            />
            <StatCard label="Active Jobs" value={activeJobsCount} icon={<Briefcase size={20} />} />
            <StatCard label="Billing Cycle" value="Monthly" icon={<Zap size={20} />} />
          </div>

          {/* Plan comparison cards */}
          <div>
            <h2 className="heading-section mb-4 text-lg text-[var(--text)]">Compare Plans</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {PLAN_ORDER.map((tier, idx) => {
                const p = PLAN_DETAILS[tier];
                const isCurrent = tier === currentTier;
                const isUpgrade = idx > currentTierIdx;
                const isSelected = selectedPlan === tier;
                return (
                  <div
                    key={tier}
                    className={`card-lifted relative flex flex-col border p-5 transition ${
                      isCurrent
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/5"
                        : isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : ""
                    }`}
                  >
                    {p.highlight && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                        Popular
                      </span>
                    )}
                    <h3 className="text-sm font-semibold capitalize text-[var(--text)]">
                      {p.label}
                    </h3>
                    <p className="mt-1 tabular-nums text-xl font-bold text-[var(--accent)]">
                      {p.price}
                    </p>
                    <ul className="mt-4 flex-1 space-y-1.5">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-white/60">
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {isCurrent ? (
                        <span className="block w-full rounded-full border border-[var(--accent)]/30 py-2 text-center text-xs font-semibold text-[var(--accent)]">
                          Current plan
                        </span>
                      ) : isUpgrade ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlan(tier);
                            setSubmitted(false);
                          }}
                          className={`block w-full rounded-full py-2 text-center text-xs font-semibold transition ${
                            isSelected
                              ? "bg-[var(--accent)] text-black"
                              : "border border-[var(--border)] text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
                          }`}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </button>
                      ) : (
                        <span className="block w-full rounded-full py-2 text-center text-xs text-white/60">
                          —
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upgrade request form */}
          {selectedPlan && (
            <div className="card-lifted border-[var(--accent)]/20 p-6">
              {submitted ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                    <Check size={24} className="text-emerald-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--text)]">
                    Request submitted
                  </h3>
                  <p className="mt-1 text-sm text-white/60">
                    We&apos;ll get back to you within 24 hours about upgrading to the{" "}
                    <span className="font-semibold capitalize text-[var(--accent)]">
                      {selectedPlan}
                    </span>{" "}
                    plan.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleUpgradeRequest} className="space-y-4">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Upgrade to{" "}
                    <span className="capitalize text-[var(--accent)]">
                      {PLAN_DETAILS[selectedPlan]?.label ?? selectedPlan}
                    </span>
                  </h3>
                  {checkoutError && (
                    <p className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-fg)]">
                      {checkoutError}
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60">Name</label>
                      <input
                        type="text"
                        readOnly
                        value={user?.name ?? ""}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60">Email</label>
                      <input
                        type="email"
                        readOnly
                        value={user?.email ?? ""}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60">
                        Organisation
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={org?.name ?? ""}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60">
                        Requested Plan
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={`${PLAN_DETAILS[selectedPlan]?.label ?? selectedPlan} — ${PLAN_DETAILS[selectedPlan]?.price ?? ""}`}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm capitalize tabular-nums text-[var(--accent)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/60">
                      Message (optional)
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Any specific requirements or questions..."
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    {selectedPlan === "enterprise"
                      ? "Submit upgrade request"
                      : "Continue to checkout"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
