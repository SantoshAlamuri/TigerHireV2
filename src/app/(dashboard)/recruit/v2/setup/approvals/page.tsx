"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { describeChain, validateChain, type ChainStepDef } from "@/lib/workflows/requisition-chain";
import { SeatGate } from "../../SeatGate";
import { ROLES, LABELS } from "./roles";
import { StepRow } from "./StepRow";

/**
 * Requisition approvals — the company's own policy, in its own words.
 *
 * Until now the chain was one of two shipped presets, and both always required
 * Finance. An org without a finance function had requisitions waiting on an
 * approver who does not exist; an org whose policy is "HM → company admin →
 * recruiter works it" could not say so at all.
 *
 * The sentence at the top is the point. A builder that shows only its own
 * widgets makes the author simulate the rule in their head; the plain-English
 * line is what they can check against the policy they actually have.
 */
interface ApiChain {
  id: string;
  name: string;
  description: string | null;
  steps: ChainStepDef[];
}

function ApprovalsBuilder() {
  const { data, loading, refetch } = useApiQuery<{
    chain: ApiChain | null;
    usingPreset: boolean;
  }>("/api/settings/requisition-chains");

  const [name, setName] = useState("Requisition approvals");
  const [steps, setSteps] = useState<ChainStepDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (loading || loadedOnce) return;
    setLoadedOnce(true);
    if (data?.chain) {
      setName(data.chain.name);
      setSteps(data.chain.steps);
    } else {
      // A sensible starting point that matches the operator's stated flow,
      // rather than an empty form that reads as "approve everything".
      setSteps([{ approverRole: "leadership", stepOrder: 1, slaHours: 8, skipWhenRaiserRole: [] }]);
    }
  }, [data, loading, loadedOnce]);

  const chain = { id: data?.chain?.id ?? "new", name, steps };
  const summary = describeChain(chain, LABELS);
  // Roles present is unknown client-side; validate shape only and let the API
  // make the "nobody holds this role" call, which needs the database.
  const shape = validateChain(
    chain,
    ROLES.map((r) => r.value),
  );

  function update(i: number, patch: Partial<ChainStepDef>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  function addStep() {
    const nextOrder = steps.length === 0 ? 1 : Math.max(...steps.map((s) => s.stepOrder)) + 1;
    setSteps((prev) => [
      ...prev,
      { approverRole: "recruiter", stepOrder: nextOrder, slaHours: 8, skipWhenRaiserRole: [] },
    ]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/requisition-chains", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await buildCsrfHeaders()) },
        credentials: "include",
        body: JSON.stringify({ name, steps }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Could not save the approval policy.");
        return;
      }
      setSaved(true);
      await refetch();
    } catch {
      setError("Could not save the approval policy.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Requisition approvals</h1>
          <p className="text-sm text-white/55">Who signs off before a job opens.</p>
        </div>
        <Link
          href="/recruit/v2/setup"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Hiring Setup
        </Link>
      </div>

      {data?.usingPreset ? (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90">
          You are on the built-in chain, which always requires Finance. Save a policy here to use
          your own.
        </p>
      ) : null}

      {/* The sentence someone can check against their real policy. */}
      <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-white/40">In plain English</p>
        <p className="mt-1 text-sm font-semibold text-[var(--text)]">{summary}</p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
          Policy name
        </span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 px-3 py-2 text-sm text-[var(--text)]"
        />
      </label>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
        Steps — same number approves in parallel
      </h2>
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <StepRow
            key={i}
            step={s}
            onChange={(patch) => update(i, patch)}
            onRemove={() => {
              setSteps((prev) => prev.filter((_, idx) => idx !== i));
              setSaved(false);
            }}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={addStep}
        className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-white/70 hover:text-[var(--text)]"
      >
        + Add a step
      </button>

      {shape.problems.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {shape.problems.map((p) => (
            <li key={p} className="text-xs text-amber-300/90">
              {p}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {saved ? (
        <p className="mt-4 text-sm text-emerald-300">
          Saved. Requisitions already in flight keep the chain they started with.
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
        <span className="text-xs text-white/40">
          Nobody approves their own requisition — that is enforced regardless of what you set here.
        </span>
      </div>
    </section>
  );
}

export default function RequisitionApprovalsSetupPage() {
  return (
    <SeatGate need="editJobSetup" what="The approval policy">
      <ApprovalsBuilder />
    </SeatGate>
  );
}
