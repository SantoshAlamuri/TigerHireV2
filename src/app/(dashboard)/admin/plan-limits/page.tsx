"use client";

import { useState } from "react";
import { Loader2, Save, Unlock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import {
  ENTITLEMENT_FEATURE_KEYS,
  ENTITLEMENT_LABELS,
  type EntitlementFeatureKey,
} from "@/lib/entitlements/config";

interface PlanRow {
  id: string;
  plan_key: string;
  plan_type: string;
  name: string;
  limits: {
    unlocks?: number;
    features?: Partial<Record<EntitlementFeatureKey, boolean>>;
  };
  stripe_price_id: string;
  updated_at: string;
}

export default function AdminPlanLimitsPage() {
  const { data, loading, mergeData } = useApiQuery<{ plans: PlanRow[] }>("/api/admin/plan-limits");
  const { mutate: updateLimit, loading: saving } = useOptimisticMutation<
    { plan: PlanRow },
    {
      plan_key: string;
      plan_type: "company";
      limits: { unlocks: number; features: Record<EntitlementFeatureKey, boolean> };
    }
  >("/api/admin/plan-limits", { method: "PATCH" });

  const [editingValue, setEditingValue] = useState<
    Record<string, { unlocks: number; features: Record<EntitlementFeatureKey, boolean> }>
  >({});
  const { toast } = useToast();
  const plans = data?.plans ?? [];

  const handleSave = async (
    planKey: string,
    nextValue: { unlocks: number; features: Record<EntitlementFeatureKey, boolean> },
  ) => {
    const previousPlans = plans;
    mergeData((prev) => ({
      plans: (prev?.plans ?? []).map((plan) =>
        plan.plan_key === planKey ? { ...plan, limits: nextValue } : plan,
      ),
    }));

    const result = await updateLimit({
      plan_key: planKey,
      plan_type: "company",
      limits: nextValue,
    });

    if (!result) {
      mergeData(() => ({ plans: previousPlans }));
      toast({
        title: "Failed to save plan limits",
        tone: "error",
      });
      return;
    }

    mergeData((prev) => ({
      plans: (prev?.plans ?? []).map((plan) => (plan.plan_key === planKey ? result.plan : plan)),
    }));
    toast({
      title: `${result.plan.name} limits saved`,
      tone: "success",
    });

    setEditingValue((e) => {
      const next = { ...e };
      delete next[planKey];
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Plan limits"
        subtitle="Unlock credits per plan. Changes apply automatically; no deploy needed."
      />
      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <div className="card-lifted overflow-x-auto rounded-xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/60">
                <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                  Plan
                </th>
                <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                  Unlocks / month
                </th>
                <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const currentValue = editingValue[plan.plan_key] ?? {
                  unlocks: plan.limits?.unlocks ?? 0,
                  features: ENTITLEMENT_FEATURE_KEYS.reduce(
                    (acc, key) => {
                      acc[key] = plan.limits?.features?.[key] ?? true;
                      return acc;
                    },
                    {} as Record<EntitlementFeatureKey, boolean>,
                  ),
                };
                const isEditing = editingValue[plan.plan_key] !== undefined;
                return (
                  <tr
                    key={plan.id}
                    className="card-lifted-hover border-b border-[var(--border)] last:border-b-0 transition-colors"
                  >
                    <td className="flex items-center gap-2 px-4 py-3 font-medium text-[var(--text)]">
                      <Unlock size={16} className="text-[var(--accent)]" />
                      {plan.name} ({plan.plan_key})
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={-1}
                          value={currentValue.unlocks}
                          onChange={(e) =>
                            setEditingValue((prev) => ({
                              ...prev,
                              [plan.plan_key]: {
                                unlocks: Number.parseInt(e.target.value, 10) ?? 0,
                                features: currentValue.features,
                              },
                            }))
                          }
                          className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[var(--text)] focus:border-white/20 focus:outline-none"
                          aria-label={`Unlocks per month for ${plan.name}`}
                        />
                      ) : (
                        <span className="text-white/60">
                          {plan.limits?.unlocks == null
                            ? "—"
                            : plan.limits.unlocks === -1
                              ? "Unlimited"
                              : plan.limits.unlocks}
                        </span>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {ENTITLEMENT_FEATURE_KEYS.map((featureKey) => {
                          const checked = currentValue.features[featureKey] ?? true;
                          return (
                            <label
                              key={featureKey}
                              className="inline-flex items-center gap-2 text-xs text-white/60"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setEditingValue((prev) => ({
                                    ...prev,
                                    [plan.plan_key]: {
                                      unlocks: currentValue.unlocks,
                                      features: {
                                        ...currentValue.features,
                                        [featureKey]: e.target.checked,
                                      },
                                    },
                                  }))
                                }
                                disabled={!isEditing}
                              />
                              {ENTITLEMENT_LABELS[featureKey]}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSave(plan.plan_key, currentValue)}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {saving ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Save size={14} />
                            )}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingValue((prev) => {
                                const next = { ...prev };
                                delete next[plan.plan_key];
                                return next;
                              })
                            }
                            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:bg-white/[0.04]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingValue((prev) => ({
                              ...prev,
                              [plan.plan_key]: {
                                unlocks: plan.limits?.unlocks ?? 0,
                                features: ENTITLEMENT_FEATURE_KEYS.reduce(
                                  (acc, key) => {
                                    acc[key] = plan.limits?.features?.[key] ?? true;
                                    return acc;
                                  },
                                  {} as Record<EntitlementFeatureKey, boolean>,
                                ),
                              },
                            }))
                          }
                          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {plans.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-white/60">No company plans found in the database.</p>
              <p className="mt-2 text-sm text-white/60">
                Run the seed migration to add default plans:
              </p>
              <code className="mt-2 inline-block rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-xs text-white/60">
                supabase db push
              </code>
              <p className="mt-3 text-xs text-white/60">
                This will create Free (5 unlocks), Starter (15), Growth (50), and Scale (unlimited)
                plans.
              </p>
            </div>
          )}
          <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-white/60">
            Use -1 for unlimited. Limits are read from DB on every unlock and org fetch; no restart
            required.
          </p>
        </div>
      )}
    </>
  );
}
