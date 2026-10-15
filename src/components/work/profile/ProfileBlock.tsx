"use client";

import { useMemo, useState } from "react";
import { invalidateQueries, useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import type { PanelProps } from "@/components/work/panels";
import type { IdealCandidateProfile } from "@/lib/fitscore/hybrid/ideal-profile";
import {
  LEVELS,
  draftFromJdBase,
  profileProblems,
  sameDraft,
  saveBody,
  withLevel,
  type ProfileDraft,
  type StructuredJdLike,
} from "@/lib/work/profile";
import { ListField } from "./ListField";
import { MarketColumn } from "./MarketColumn";
import s from "./profile.module.css";

export interface JdBaseView {
  jdBase?: {
    roleTitle?: string | null;
    weights?: Record<string, number> | null;
    scoreFloor?: number | null;
    fitThresholds?: { strong: number; good: number; moderate: number; weak: number } | null;
    idealCandidateProfile?: Partial<IdealCandidateProfile> | null;
    structuredJd?: StructuredJdLike | null;
    approvedBy?: string | null;
    scoringFoundation?: "india_template" | "llm";
    indiaTemplateId?: string | null;
    indiaTemplateCategory?: string | null;
    indiaTemplateRoleTitle?: string | null;
  } | null;
  pendingScoringCount?: number;
  jobTitle?: string;
  jobDescriptionText?: string;
}

/**
 * Who you're looking for. The agent drafts it from the description; you shape
 * it. Must-haves decide the score most; outcomes, competencies and traits
 * sharpen it. The market column says how the role sits against pay and the
 * candidate pool.
 */
export function ProfileBlock({ jobId, job, onDone, onLog }: PanelProps) {
  const base = useApiQuery<JdBaseView>("/api/fitscore/jd-base", { jobId });
  const build = useApiMutation<{ jobId: string }, unknown>("/api/fitscore/jd-base", "POST");

  async function refresh() {
    invalidateQueries("/api/fitscore/jd-base");
    await base.refetch({ silent: true });
  }

  if (base.loading && !base.data) return <p className="wd-muted">Loading the profile…</p>;
  if (base.error && !base.data)
    return (
      <p role="alert" className="wd-problem">
        The profile could not be loaded: {base.error}
      </p>
    );

  const doc = base.data?.jdBase ?? null;
  if (!doc) {
    return (
      <div className="wd-stack" style={{ gap: 20 }}>
        <p className="wd-lede">
          The agent reads the description and drafts who you&apos;re looking for: level, must-haves,
          outcomes and traits. You shape it before anyone is scored.
        </p>
        {build.error && <p className="wd-problem">{build.error}</p>}
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={build.loading}
            onClick={async () => {
              const ok = await build.mutate({ jobId });
              if (ok) {
                onLog("agent", "Drafted the ideal candidate from the description");
                await refresh();
              }
            }}
          >
            {build.loading ? "The agent is drafting…" : "Draft the ideal candidate"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProfileEditor
      key={
        JSON.stringify(doc.idealCandidateProfile ?? null) + JSON.stringify(doc.structuredJd ?? null)
      }
      jobId={jobId}
      title={doc.roleTitle || base.data?.jobTitle || job.title || "this role"}
      jobText={base.data?.jobDescriptionText ?? job.description ?? ""}
      doc={doc}
      onLog={onLog}
      onSaved={async (first) => {
        await refresh();
        if (first) onDone("Ideal candidate set");
      }}
      job={job}
      onTemplate={refresh}
    />
  );
}

function ProfileEditor({
  jobId,
  title,
  jobText,
  doc,
  job,
  onLog,
  onSaved,
  onTemplate,
}: {
  jobId: string;
  title: string;
  jobText: string;
  doc: NonNullable<JdBaseView["jdBase"]>;
  job: PanelProps["job"];
  onLog: PanelProps["onLog"];
  onSaved: (first: boolean) => Promise<void>;
  onTemplate: () => Promise<void>;
}) {
  const start = useMemo(
    () => draftFromJdBase(doc.idealCandidateProfile, doc.structuredJd, jobText),
    [doc.idealCandidateProfile, doc.structuredJd, jobText],
  );
  const [d, setD] = useState<ProfileDraft>(start);
  const put = useApiMutation<ReturnType<typeof saveBody>, unknown>("/api/fitscore/jd-base", "PUT");
  const problems = profileProblems(d);
  const dirty = !sameDraft(start, d);
  const wasEmpty = start.must.length === 0;
  const set =
    <K extends keyof ProfileDraft>(k: K) =>
    (v: ProfileDraft[K]) =>
      setD((p) => ({ ...p, [k]: v }));

  async function save() {
    const ok = await put.mutate(
      saveBody(jobId, d, { icp: doc.idealCandidateProfile, structured: doc.structuredJd, title }),
    );
    if (!ok) return;
    onLog("you", wasEmpty ? "Set the ideal candidate" : "Changed the ideal candidate");
    if (doc.approvedBy) onLog("auto", "Rubric needs approving again after the change");
    await onSaved(wasEmpty || !doc.approvedBy);
  }

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <div className="wd-stack" style={{ gap: 14 }}>
          <label className="wd-stack" style={{ gap: 6 }}>
            <span className="wd-small" style={{ color: "var(--wd-soft)" }}>
              In one line
            </span>
            <input
              className="wd-input"
              value={d.summary}
              placeholder={`The ${title} you'd hire tomorrow`}
              onChange={(e) => set("summary")(e.target.value)}
            />
          </label>
          <div className={s.who}>
            <div role="radiogroup" aria-label="Level" className={s.levels}>
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={d.level === l.value}
                  className={s.level}
                  onClick={() => setD((p) => withLevel(p, l.value))}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <span className={s.years}>
              <input
                type="number"
                min={0}
                max={40}
                className={s.num}
                aria-label="Minimum years"
                value={d.yearsMin}
                onChange={(e) => set("yearsMin")(Number(e.target.value))}
              />
              to
              <input
                type="number"
                min={0}
                max={40}
                className={s.num}
                aria-label="Maximum years"
                value={d.yearsMax}
                onChange={(e) => set("yearsMax")(Number(e.target.value))}
              />
              years
            </span>
          </div>
        </div>

        <section className={s.group} aria-label="Requirements">
          <h3 className={s.groupTitle}>What they must bring</h3>
          <div className={s.cols}>
            <ListField
              label="Must have"
              hint="Missing one lowers the score a lot."
              tone="must"
              items={d.must}
              onChange={set("must")}
              placeholder="Add a must-have"
              max={12}
            />
            <ListField
              label="Should have"
              hint="Expected, but someone strong can lack one."
              tone="should"
              items={d.should}
              onChange={set("should")}
              placeholder="Add a should-have"
            />
            <ListField
              label="Nice to have"
              hint="Adds to the score, never rules anyone out."
              tone="nice"
              items={d.nice}
              onChange={set("nice")}
              placeholder="Add a nice-to-have"
            />
          </div>
        </section>

        <section className={s.group} aria-label="Outcomes and competencies">
          <h3 className={s.groupTitle}>What good looks like in the job</h3>
          <div className={s.cols2}>
            <ListField
              label="Outcomes in the first year"
              hint="Measurable results, e.g. cut release time from 5 days to 1."
              items={d.outcomes}
              onChange={set("outcomes")}
              placeholder="Add an outcome"
            />
            <ListField
              label="Competencies"
              hint="How they work, as something you could see them do."
              items={d.competencies}
              onChange={set("competencies")}
              placeholder="Add a competency"
            />
          </div>
        </section>

        <section className={s.group} aria-label="Traits and background">
          <h3 className={s.groupTitle}>Who they are</h3>
          <div className={s.cols}>
            <ListField
              label="Traits"
              items={d.traits}
              onChange={set("traits")}
              placeholder="e.g. Takes ownership"
            />
            <ListField
              label="Background"
              hint="Company type, ways of working."
              items={d.background}
              onChange={set("background")}
              placeholder="e.g. Product company"
            />
            <ListField
              label="Certifications"
              items={d.certifications}
              onChange={set("certifications")}
              placeholder="e.g. ISTQB"
            />
          </div>
        </section>

        {(dirty || put.error) && (
          <div className={s.saveBar} role="region" aria-label="Save the ideal candidate">
            <span className={s.saveNote}>
              {put.error
                ? put.error
                : problems.length
                  ? problems.join(" ")
                  : doc.approvedBy
                    ? "Saving changes what candidates are scored on; the rubric will need approving again."
                    : "Not saved yet."}
            </span>
            <button type="button" className="wd-btn quiet" onClick={() => setD(start)}>
              Undo
            </button>
            <button
              type="button"
              className="wd-btn go"
              disabled={put.loading || problems.length > 0}
              onClick={() => void save()}
            >
              {put.loading ? "Saving…" : "Save the ideal candidate"}
            </button>
          </div>
        )}
        {!dirty && !put.error && start.must.length > 0 && (
          <p className="wd-small wd-muted" role="status" style={{ margin: 0 }}>
            Saved. Edit anything above and it&apos;s offered back to you to save.
          </p>
        )}
      </div>

      <MarketColumn jobId={jobId} job={job} doc={doc} onLog={onLog} onTemplate={onTemplate} />
    </div>
  );
}
