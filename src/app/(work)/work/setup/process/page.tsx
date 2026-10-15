"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame, useFromWelcome } from "@/components/work/setup/SetupFrame";
import { useOnboardingHints } from "@/components/work/use-onboarding";
import { ONBOARDING_HINTS } from "@/lib/work/onboarding";
import {
  STAGE_KINDS,
  kindName,
  move,
  splitStages,
  stagesProblem,
  toPayload,
  type StageBands,
  type StageRow,
  type StageType,
} from "@/lib/work/process";

/** The two approval routes for new roles, said plainly. */
const ROLE_APPROVALS: Record<string, { name: string; how: string }> = {
  requisition_linear_v1: {
    name: "Finance, then an admin",
    how: "One after the other. Each has 8 hours.",
  },
  requisition_parallel_hr_finance_v1: {
    name: "Finance and an admin together",
    how: "Both at once, so it's quicker.",
  },
};

export default function ProcessSetupPage() {
  return (
    <Suspense fallback={null}>
      <ProcessSetup />
    </Suspense>
  );
}

/**
 * Your hiring process: the stages every new job starts with, and who approves
 * new roles and offers. The defaults work; this is for when yours differ.
 */
function ProcessSetup() {
  const { user } = useAuth();
  const fromWelcome = useFromWelcome();
  const canEdit = Boolean(user?.isOrgAdmin) || user?.role === "super_admin";
  const { hints, dismiss } = useOnboardingHints();
  const reviewed = hints.includes(ONBOARDING_HINTS.processReviewed);

  const stagesQuery = useApiQuery<{ stages: StageRow[] }>("/api/org/pipeline-defaults");
  const approvalsQuery = useApiQuery<{
    requisitionApprovalWorkflowKey: string;
    options: { key: string; label: string; description: string }[];
  }>(canEdit ? "/api/settings/requisition-approval-workflow" : null);

  const [bands, setBands] = useState<StageBands | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [approvalNote, setApprovalNote] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty && stagesQuery.data) setBands(splitStages(stagesQuery.data.stages));
  }, [stagesQuery.data, dirty]);

  const edit = (fn: (b: StageBands) => StageBands) => {
    setBands((b) => (b ? fn(b) : b));
    setDirty(true);
    setSaved(false);
    setProblem(null);
  };

  const rename = (i: number, name: string) =>
    edit((b) => ({ ...b, middle: b.middle.map((s, j) => (j === i ? { ...s, name } : s)) }));
  const retype = (i: number, type: StageType) =>
    edit((b) => ({ ...b, middle: b.middle.map((s, j) => (j === i ? { ...s, type } : s)) }));
  const shift = (i: number, by: number) =>
    edit((b) => ({ ...b, middle: move(b.middle, i, i + by) }));
  const drop = (i: number) => {
    const id = bands?.middle[i]?.id;
    if (id) setRemoved((r) => [...r, id]);
    edit((b) => ({ ...b, middle: b.middle.filter((_, j) => j !== i) }));
  };
  const add = () =>
    edit((b) => ({
      ...b,
      middle: [...b.middle, { key: `new-${Date.now()}`, name: "", type: "interview" as StageType }],
    }));

  const save = async () => {
    if (!bands) return;
    const issue = stagesProblem(bands);
    if (issue) return setProblem(issue);
    setSaving(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    try {
      for (const id of removed) {
        const res = await fetch(`/api/org/pipeline-defaults/${id}`, {
          method: "DELETE",
          credentials: "include",
          headers: csrf,
        });
        if (!res.ok) throw new Error("Couldn't remove a stage.");
      }
      const res = await fetch("/api/org/pipeline-defaults", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ stages: toPayload(bands) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't save the stages.");
      }
      setRemoved([]);
      setDirty(false);
      setSaved(true);
      await stagesQuery.refetch({ silent: true });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't save the stages.");
    } finally {
      setSaving(false);
    }
  };

  const chooseApproval = async (key: string) => {
    setApprovalNote(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/requisition-approval-workflow", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({ requisitionApprovalWorkflowKey: key }),
    }).catch(() => null);
    if (res?.status === 409) {
      setApprovalNote("Changing this needs custom approvals turned on for your company first.");
    } else if (!res?.ok) {
      setApprovalNote("Couldn't change it. Try again.");
    }
    await approvalsQuery.refetch({ silent: true });
  };

  const currentApproval = approvalsQuery.data?.requisitionApprovalWorkflowKey;

  return (
    <SetupFrame
      sig="Your hiring process"
      title={canEdit ? "Is this how you hire?" : "How your team hires."}
      lede="Every new job starts with these stages. The defaults work for most teams; change them only if yours differ."
      done={fromWelcome ? reviewed : undefined}
    >
      {stagesQuery.loading && !bands ? (
        <p role="status" className="wd-muted">
          Loading your stages…
        </p>
      ) : stagesQuery.error || !bands ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your stages. Reload to try again.
        </p>
      ) : (
        <section className="wd-stack" style={{ gap: 10 }} aria-labelledby="stages-h">
          <h2 id="stages-h" className="wd-h2">
            Stages
          </h2>
          <ol className="wd-stages">
            {bands.start.map((s) => (
              <li key={s.id ?? s.stage_name} className="wd-stage fixed">
                <span className="wd-stage-name">{s.stage_name}</span>
                <span className="wd-sig auto">Automatic</span>
              </li>
            ))}
            {bands.middle.map((s, i) => (
              <li key={s.key} className="wd-stage">
                {canEdit ? (
                  <>
                    <input
                      className="wd-input wd-stage-name"
                      value={s.name}
                      placeholder="Name this stage"
                      aria-label={`Stage ${i + 1} name`}
                      onChange={(e) => rename(i, e.target.value)}
                    />
                    <select
                      className="wd-input"
                      style={{ width: "auto" }}
                      value={s.type}
                      aria-label={`${s.name || "New stage"} kind`}
                      onChange={(e) => retype(i, e.target.value as StageType)}
                    >
                      {STAGE_KINDS.map((k) => (
                        <option key={k.type} value={k.type}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                    <span className="wd-stage-tools">
                      <button
                        type="button"
                        aria-label={`Move ${s.name || "stage"} up`}
                        disabled={i === 0}
                        onClick={() => shift(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${s.name || "stage"} down`}
                        disabled={i === bands.middle.length - 1}
                        onClick={() => shift(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${s.name || "stage"}`}
                        onClick={() => drop(i)}
                      >
                        ×
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="wd-stage-name">{s.name}</span>
                    <span className="wd-small wd-muted">{kindName(s.type)}</span>
                  </>
                )}
              </li>
            ))}
            {bands.end.map((s) => (
              <li key={s.id ?? s.stage_name} className="wd-stage fixed">
                <span className="wd-stage-name">{s.stage_name}</span>
                <span className="wd-sig auto">Outcome</span>
              </li>
            ))}
          </ol>

          {canEdit && (
            <div className="wd-row-actions">
              <button type="button" className="wd-btn quiet" onClick={add}>
                + Add a stage
              </button>
              {dirty && (
                <button
                  type="button"
                  className="wd-btn go"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save stages"}
                </button>
              )}
              {saved && !dirty && (
                <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
                  Saved. New jobs will use these.
                </span>
              )}
            </div>
          )}
          {problem && (
            <p role="alert" className="wd-problem">
              {problem}
            </p>
          )}
        </section>
      )}

      <section className="wd-stack" style={{ gap: 10 }} aria-labelledby="approvals-h">
        <h2 id="approvals-h" className="wd-h2">
          Who approves
        </h2>
        <div className="wd-lines" style={{ borderBottom: 0 }}>
          <div className="wd-line" style={{ gridTemplateColumns: "160px minmax(0,1fr)" }}>
            <span className="wd-line-label">New roles</span>
            {canEdit && approvalsQuery.data ? (
              <div className="wd-choices" role="radiogroup" aria-label="Who approves new roles">
                {approvalsQuery.data.options.map((o) => {
                  const plain = ROLE_APPROVALS[o.key] ?? { name: o.label, how: o.description };
                  const on = currentApproval === o.key;
                  return (
                    <label key={o.key} className={`wd-choice ${on ? "on" : ""}`}>
                      <input
                        type="radio"
                        name="role-approvals"
                        checked={on}
                        onChange={() => void chooseApproval(o.key)}
                      />
                      <span style={{ display: "block", fontSize: 15 }}>{plain.name}</span>
                      <span className="wd-src" style={{ display: "block", marginTop: 2 }}>
                        {plain.how}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <span className="wd-line-value">
                {ROLE_APPROVALS[currentApproval ?? "requisition_linear_v1"]?.name ??
                  "Finance, then an admin"}
              </span>
            )}
          </div>
          {approvalNote && (
            <p role="alert" className="wd-problem" style={{ padding: "0 0 8px" }}>
              {approvalNote}
            </p>
          )}
          <div className="wd-line" style={{ gridTemplateColumns: "160px minmax(0,1fr)" }}>
            <span className="wd-line-label">Offers</span>
            <span className="wd-line-value">
              An admin approves every offer before it goes to the candidate.
            </span>
          </div>
        </div>
      </section>

      {canEdit && fromWelcome && !reviewed && (
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={dirty}
            title={dirty ? "Save your stages first" : undefined}
            onClick={() => void dismiss(ONBOARDING_HINTS.processReviewed)}
          >
            This is how we hire
          </button>
        </div>
      )}
    </SetupFrame>
  );
}
