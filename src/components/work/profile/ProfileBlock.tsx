"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { MarketRows } from "./MarketColumn";
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
 * Who you're looking for. Same as before: the profile is drafted automatically
 * (from the role library when the description matches a template, otherwise
 * by the agent) as soon as the job exists. This step shows it calmly — the
 * must-haves up front, everything else one tap away — so you only touch what
 * needs changing.
 */
export function ProfileBlock({ jobId, job, onDone, onLog }: PanelProps) {
  const base = useApiQuery<JdBaseView>("/api/fitscore/jd-base", { jobId });

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
  if (!doc) return <AutoDraft jobId={jobId} onLog={onLog} onReady={refresh} />;

  return (
    <ProfileEditor
      key={
        JSON.stringify(doc.idealCandidateProfile ?? null) + JSON.stringify(doc.structuredJd ?? null)
      }
      jobId={jobId}
      title={doc.roleTitle || base.data?.jobTitle || job.title || "this role"}
      jobText={base.data?.jobDescriptionText ?? job.description ?? ""}
      doc={doc}
      job={job}
      onLog={onLog}
      onSaved={async (first) => {
        await refresh();
        if (first) onDone("Ideal candidate set");
      }}
      onTemplate={refresh}
    />
  );
}

/**
 * The old job page never asked for this: when a job's profile wasn't there
 * yet it waited for the background draft, then drafted it itself. Same here.
 */
function AutoDraft({
  jobId,
  onLog,
  onReady,
}: {
  jobId: string;
  onLog: PanelProps["onLog"];
  onReady: () => Promise<void>;
}) {
  const build = useApiMutation<{ jobId: string }, unknown>("/api/fitscore/jd-base", "POST");
  const started = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current && attempt === 0) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      // A background draft may already be running from job creation: give it a moment.
      for (let i = 0; i < 3 && attempt === 0; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) return;
        const res = await fetch(`/api/fitscore/jd-base?jobId=${encodeURIComponent(jobId)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as JdBaseView;
        if (j.jdBase) return void onReady();
      }
      if (cancelled) return;
      const ok = await build.mutate({ jobId });
      if (ok && !cancelled) {
        onLog("agent", "Drafted the ideal candidate from the description");
        await onReady();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, attempt]);

  return (
    <div className="wd-stack" style={{ gap: 14 }}>
      {build.error ? (
        <>
          <p role="alert" className="wd-problem">
            The agent couldn&apos;t draft the profile: {build.error}
          </p>
          <div className="wd-row-actions">
            <button type="button" className="wd-btn" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        </>
      ) : (
        <p className="wd-lede" role="status">
          <span className="wd-sig agent" style={{ marginRight: 10 }}>
            Agent
          </span>
          Drafting who you&apos;re looking for from the description…
        </p>
      )}
    </div>
  );
}

type SectionKey = "should" | "nice" | "outcomes" | "competencies" | "who";

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
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [editingWho, setEditingWho] = useState(false);
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

  const levelLabel = LEVELS.find((l) => l.value === d.level)?.label ?? "";
  const who = d.traits.length + d.background.length + d.certifications.length;
  const rows: { key: SectionKey; label: string; count: number; preview: string }[] = [
    { key: "should", label: "Should have", count: d.should.length, preview: d.should[0] ?? "" },
    { key: "nice", label: "Nice to have", count: d.nice.length, preview: d.nice[0] ?? "" },
    {
      key: "outcomes",
      label: "First-year outcomes",
      count: d.outcomes.length,
      preview: d.outcomes[0] ?? "",
    },
    {
      key: "competencies",
      label: "How they work",
      count: d.competencies.length,
      preview: d.competencies[0] ?? "",
    },
    {
      key: "who",
      label: "Traits, background, certifications",
      count: who,
      preview: [...d.traits, ...d.background, ...d.certifications][0] ?? "",
    },
  ];

  return (
    <div className={s.calm}>
      <div className={s.intro}>
        {d.summary && <p className={s.summary}>{d.summary}</p>}
        {editingWho ? (
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
            <label className={s.summaryEdit}>
              <span className={s.fieldHint}>In one line</span>
              <input
                className="wd-input"
                value={d.summary}
                onChange={(e) => set("summary")(e.target.value)}
              />
            </label>
            <button type="button" className={s.link} onClick={() => setEditingWho(false)}>
              Done
            </button>
          </div>
        ) : (
          <p className={s.meta}>
            {levelLabel} · {d.yearsMin === d.yearsMax ? d.yearsMin : `${d.yearsMin}–${d.yearsMax}`}{" "}
            years
            <button type="button" className={s.link} onClick={() => setEditingWho(true)}>
              Change
            </button>
          </p>
        )}
      </div>

      <section className={s.mustBlock} aria-label="Must have">
        <ListField
          label="Must have"
          hint="These decide the score most."
          tone="must"
          items={d.must}
          onChange={set("must")}
          placeholder="Add a must-have"
          max={12}
        />
      </section>

      <section aria-label="More about the role" className={s.rows}>
        {rows.map((r) => {
          const isOpen = open === r.key;
          return (
            <div key={r.key} className={s.rowWrap}>
              <button
                type="button"
                className={s.discl}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.key)}
              >
                <span className={s.disclLabel}>{r.label}</span>
                <span className={s.disclPreview}>{r.count ? r.preview : <em>None yet</em>}</span>
                <span className={s.disclCount}>
                  {r.count > 1 ? `+${r.count - 1}` : ""}
                  <i aria-hidden="true">{isOpen ? "−" : "+"}</i>
                </span>
              </button>
              {isOpen && (
                <div className={s.disclBody}>
                  {r.key === "should" && (
                    <ListField
                      label="Should have"
                      hint="Expected, but someone strong can lack one."
                      tone="should"
                      items={d.should}
                      onChange={set("should")}
                      placeholder="Add a should-have"
                    />
                  )}
                  {r.key === "nice" && (
                    <ListField
                      label="Nice to have"
                      hint="Adds to the score, never rules anyone out."
                      items={d.nice}
                      onChange={set("nice")}
                      placeholder="Add a nice-to-have"
                    />
                  )}
                  {r.key === "outcomes" && (
                    <ListField
                      label="First-year outcomes"
                      hint="Measurable results, e.g. cut release time from 5 days to 1."
                      items={d.outcomes}
                      onChange={set("outcomes")}
                      placeholder="Add an outcome"
                    />
                  )}
                  {r.key === "competencies" && (
                    <ListField
                      label="How they work"
                      hint="Something you could see them do."
                      items={d.competencies}
                      onChange={set("competencies")}
                      placeholder="Add a competency"
                    />
                  )}
                  {r.key === "who" && (
                    <div className={s.cols}>
                      <ListField
                        label="Traits"
                        items={d.traits}
                        onChange={set("traits")}
                        placeholder="e.g. Takes ownership"
                      />
                      <ListField
                        label="Background"
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <MarketRows jobId={jobId} job={job} doc={doc} onLog={onLog} onTemplate={onTemplate} />

      {(dirty || put.error) && (
        <div className={s.saveBar} role="region" aria-label="Save the ideal candidate">
          <span className={s.saveNote}>
            {put.error
              ? put.error
              : problems.length
                ? problems.join(" ")
                : doc.approvedBy
                  ? "Saving changes the scoring, so the rubric needs approving again."
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
            {put.loading ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
