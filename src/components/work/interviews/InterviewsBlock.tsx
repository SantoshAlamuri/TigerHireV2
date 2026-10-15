"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invalidateQueries, useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import type { PanelProps } from "@/components/work/panels";
import {
  buildInterviewBoard,
  isCleared,
  plural,
  slotsFromWindows,
  type AggregateInterview,
  type AvailabilitySlot,
  type DeclaredWindow,
  type PipelineRow,
  type StageRow,
} from "@/lib/work/interviews";
import { OwedList } from "./OwedList";
import { ScheduleList } from "./ScheduleList";
import { BookedList } from "./BookedList";
import s from "./interviews.module.css";

const DAY = 86_400_000;

/**
 * Interviews, native. One question: who needs an interview, and who owes
 * feedback? Scorecards owed come first, then shortlisted people with nothing
 * booked, then what is booked. Everything runs on the existing interview
 * routes; nothing here is new backend.
 */
export function InterviewsBlock({ jobId, onDone, onLog }: PanelProps) {
  // Windows are fixed when the step opens so query keys stay stable.
  const [range] = useState(() => {
    const t = Date.now();
    return {
      // Past interviews are needed to find owed scorecards; the aggregate
      // feed defaults to "from now" and would hide them.
      ivFrom: new Date(t - 60 * DAY).toISOString(),
      ivTo: new Date(t + 90 * DAY).toISOString(),
      slotFrom: new Date(t - 90 * DAY).toISOString(),
      slotTo: new Date(t + 120 * DAY).toISOString(),
      winTo: new Date(t + 28 * DAY).toISOString(),
    };
  });
  const [now, setNow] = useState(() => Date.now());

  const aggregate = useApiQuery<{ interviews: AggregateInterview[] }>("/api/interviews/aggregate", {
    job_id: jobId,
    from: range.ivFrom,
    to: range.ivTo,
  });
  const availability = useApiQuery<{ slots: AvailabilitySlot[] }>(
    `/api/jobs/${jobId}/availability`,
    { from: range.slotFrom, to: range.slotTo },
  );
  const pipeline = useApiQuery<{ candidates: PipelineRow[] }>(
    `/api/jobs/${jobId}/pipeline/approve`,
  );
  const stagesQ = useApiQuery<{ stages: StageRow[] }>(`/api/jobs/${jobId}/pipeline-stages`);
  const declared = useApiQuery<{ windows: DeclaredWindow[]; has_declared_availability: boolean }>(
    `/api/jobs/${jobId}/interviewer-availability`,
  );
  const openFromWindows = useApiMutation<
    {
      slots: { start_at: string; end_at: string; source: "interviewer_declared" }[];
      source: "interviewer_declared";
    },
    { slots?: unknown[] }
  >(`/api/jobs/${jobId}/availability`, "POST");

  const [linkSent, setLinkSent] = useState<Set<string>>(() => new Set());
  const acted = useRef(false);
  const finished = useRef(false);

  const stages = useMemo(() => stagesQ.data?.stages ?? [], [stagesQ.data]);
  const stageById = useMemo(() => new Map(stages.map((st) => [st.id, st])), [stages]);
  const pcStage = useMemo(
    () => new Map((pipeline.data?.candidates ?? []).map((p) => [p.id, p.stage_id ?? null])),
    [pipeline.data],
  );

  const degraded = Boolean(aggregate.error);
  const board = useMemo(
    () =>
      buildInterviewBoard({
        interviews: aggregate.error ? null : (aggregate.data?.interviews ?? []),
        slots: availability.data?.slots ?? [],
        pipeline: pipeline.data?.candidates ?? [],
        stages,
        now,
      }),
    [aggregate.data, aggregate.error, availability.data, pipeline.data, stages, now],
  );

  const { refetch: rA } = aggregate;
  const { refetch: rV } = availability;
  const { refetch: rP } = pipeline;
  const { refetch: rS } = stagesQ;
  /** After any action: re-read everything quietly, and mark that the person acted. */
  const refresh = useCallback(async () => {
    acted.current = true;
    invalidateQueries("/api/interviews/aggregate");
    invalidateQueries(`/api/jobs/${jobId}/availability`);
    await Promise.all([
      rA({ silent: true }),
      rV({ silent: true }),
      rP({ silent: true }),
      rS({ silent: true }),
    ]);
    setNow(Date.now());
  }, [jobId, rA, rV, rP, rS]);

  const loading =
    (availability.loading && !availability.data) ||
    (pipeline.loading && !pipeline.data) ||
    (stagesQ.loading && !stagesQ.data) ||
    (aggregate.loading && !aggregate.data && !aggregate.error);
  const fatal = availability.error ?? pipeline.error ?? null;

  // Once the person has cleared what they owe, hand them on — once.
  useEffect(() => {
    if (loading || fatal || finished.current || !acted.current) return;
    if (isCleared(board, linkSent)) {
      finished.current = true;
      onDone("Interviews arranged");
    }
  }, [board, linkSent, loading, fatal, onDone]);

  if (loading) {
    return (
      <p role="status" className="wd-muted">
        Loading interviews…
      </p>
    );
  }

  if (fatal) {
    return (
      <div className="wd-stack" style={{ gap: 20 }}>
        <p role="alert" className="wd-problem">
          Interviews could not be loaded: {fatal}
        </p>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const nothing = !board.owed.length && !board.toSchedule.length && !board.booked.length;
  const futureWindows = slotsFromWindows(declared.data?.windows ?? [], now);

  async function openDeclaredTimes() {
    const res = await openFromWindows.mutate({
      slots: futureWindows.map((w) => ({ ...w, source: "interviewer_declared" as const })),
      source: "interviewer_declared",
    });
    if (res) {
      onLog("auto", `Opened ${plural(futureWindows.length, "time")} from interviewers' calendars`);
      await refresh();
    }
  }

  return (
    <div className="wd-stack" style={{ gap: 48 }}>
      <div className="wd-numbers">
        <div className="wd-number">
          <b>{degraded ? "–" : board.owed.length}</b>
          <span>Scorecards owed</span>
        </div>
        <div className="wd-number">
          <b>{board.toSchedule.length}</b>
          <span>To schedule</span>
        </div>
        <div className="wd-number">
          <b>{board.booked.length}</b>
          <span>Booked</span>
        </div>
        <div className="wd-number">
          <b>{board.openSlots.length}</b>
          <span>Open times</span>
        </div>
      </div>

      {degraded && (
        <div className="wd-panel bad">
          <span className="wd-sig bad">Partial view</span>
          <p className={s.notice} style={{ marginTop: 10 }}>
            The interview feed did not load ({aggregate.error}), so owed scorecards cannot be shown
            and booked interviews come from the calendar slots alone. Try again in a moment.
          </p>
        </div>
      )}

      {nothing && (
        <p className="wd-lede">
          Nobody is waiting for an interview and no feedback is owed. Shortlisted candidates appear
          here to be scheduled.
        </p>
      )}

      <OwedList
        jobId={jobId}
        items={board.owed}
        now={now}
        templateFor={(pcId) => stageById.get(pcStage.get(pcId) ?? "")?.feedback_template_id ?? null}
        onAgent={(what) => onLog("agent", what)}
        onFiled={async (o) => {
          onLog("you", `Filed the scorecard for ${o.candidateName}`);
          await refresh();
        }}
      />

      {board.toSchedule.length > 0 && board.openSlots.length === 0 && futureWindows.length > 0 && (
        <div className="wd-panel agent">
          <span className="wd-sig agent">Interviewers have shared free time</span>
          <p className={s.notice} style={{ margin: "10px 0 14px" }}>
            Turn it into {plural(futureWindows.length, "hour-long interview time")} that candidates
            can pick from.
          </p>
          {openFromWindows.error && (
            <p role="alert" className="wd-problem">
              {openFromWindows.error}
            </p>
          )}
          <button
            type="button"
            className="wd-btn go"
            disabled={openFromWindows.loading}
            onClick={() => void openDeclaredTimes()}
          >
            {openFromWindows.loading ? "Opening…" : "Open these times"}
          </button>
        </div>
      )}

      <ScheduleList
        jobId={jobId}
        items={board.toSchedule}
        openSlots={board.openSlots}
        stageById={stageById}
        linkSent={linkSent}
        onLinkSent={(id) => {
          acted.current = true;
          setLinkSent((prev) => new Set(prev).add(id));
        }}
        onBooked={refresh}
        onInterviewerSaved={refresh}
        onSlotsChanged={refresh}
        onLog={onLog}
      />

      <BookedList
        jobId={jobId}
        items={board.booked}
        openSlots={board.openSlots}
        now={now}
        onChanged={refresh}
        onSlotsChanged={refresh}
        onLog={onLog}
      />
    </div>
  );
}
