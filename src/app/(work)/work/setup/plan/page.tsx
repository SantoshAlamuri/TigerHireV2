"use client";

import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { mapDbOrgToView } from "@/lib/mappers";
import { PLAN_DETAILS, PLAN_ORDER } from "@/lib/billing/plan-details";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

const SELF_SERVE = new Set(["starter", "growth", "scale"]);

export default function PlanSetupPage() {
  return (
    <Suspense fallback={null}>
      <PlanSetup />
    </Suspense>
  );
}

/** Your plan: what you're on, how much of it you've used, and a one-press move up. */
function PlanSetup() {
  const { user } = useAuth();
  const orgQ = useApiQuery<{ organisation: Record<string, unknown> }>("/api/organisations");
  const jobsQ = useApiQuery<{ pagination: { total: number } }>("/api/jobs", { status: "open" });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  const org = orgQ.data?.organisation ? mapDbOrgToView(orgQ.data.organisation) : null;
  const tier = org?.billingTier ?? "free";
  const plan = PLAN_DETAILS[tier] ?? PLAN_DETAILS.free;
  const at = PLAN_ORDER.indexOf(tier as (typeof PLAN_ORDER)[number]);
  const unlimited = (org?.unlockQuotaMonthly ?? 0) < 0;

  const move = async (key: string) => {
    setBusy(key);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    try {
      if (SELF_SERVE.has(key)) {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...csrf },
          body: JSON.stringify({ type: "company", plan: key }),
        });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't start checkout.");
        window.location.assign(body.url);
        return;
      }
      const res = await fetch("/api/contact", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({
          type: "upgrade_request",
          name: user?.name ?? "",
          email: user?.email ?? "",
          organisation: org?.name ?? "",
          currentPlan: tier,
          requestedPlan: key,
          message: "",
        }),
      });
      if (!res.ok) throw new Error("Couldn't send the request.");
      setAsked(key);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SetupFrame
      sig="Your plan"
      title={org ? `You're on ${plan.label}.` : "Your plan."}
      lede="What your plan includes, how much of it you've used this month, and what moving up adds."
    >
      {orgQ.loading && !orgQ.data ? (
        <p role="status" className="wd-muted">
          Loading your plan…
        </p>
      ) : !org ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your plan. Reload to try again.
        </p>
      ) : (
        <>
          <dl className="wd-numbers wd-home-numbers">
            <div className="wd-number">
              <dt>Profile unlocks this month</dt>
              <dd>
                {org.unlocksUsedThisMonth}
                <small> {unlimited ? "of unlimited" : `of ${org.unlockQuotaMonthly}`}</small>
              </dd>
            </div>
            <div className="wd-number">
              <dt>Open jobs</dt>
              <dd>{jobsQ.data?.pagination?.total ?? "—"}</dd>
            </div>
            <div className="wd-number">
              <dt>Seats</dt>
              <dd>
                {org.seatsUsed}
                <small> of {org.seatsTotal}</small>
              </dd>
            </div>
            <div className="wd-number">
              <dt>Price</dt>
              <dd style={{ fontSize: 26 }}>{plan.price}</dd>
            </div>
          </dl>

          <section className="wd-group" aria-labelledby="plans-h">
            <header className="wd-group-head">
              <h2 id="plans-h" className="wd-h2">
                Plans
              </h2>
            </header>
            <div className="wd-plans">
              {PLAN_ORDER.map((key, i) => {
                const p = PLAN_DETAILS[key];
                const current = key === tier;
                return (
                  <article key={key} className={`wd-plan ${current ? "on" : ""}`}>
                    <span className={`wd-sig ${current ? "you" : "auto"}`}>
                      {current ? "Your plan" : p.label}
                    </span>
                    <h3 className="wd-h2">{p.label}</h3>
                    <p className="wd-plan-price">{p.price}</p>
                    <ul>
                      {p.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    {i > at &&
                      (asked === key ? (
                        <span
                          role="status"
                          className="wd-small"
                          style={{ color: "var(--wd-good)" }}
                        >
                          Asked. We&apos;ll be in touch.
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`wd-btn ${i === at + 1 ? "go" : ""}`}
                          disabled={busy !== null}
                          onClick={() => void move(key)}
                        >
                          {busy === key
                            ? "One moment…"
                            : SELF_SERVE.has(key)
                              ? `Move to ${p.label}`
                              : "Talk to us"}
                        </button>
                      ))}
                  </article>
                );
              })}
            </div>
            {problem && (
              <p role="alert" className="wd-problem">
                {problem}
              </p>
            )}
          </section>
        </>
      )}
    </SetupFrame>
  );
}
