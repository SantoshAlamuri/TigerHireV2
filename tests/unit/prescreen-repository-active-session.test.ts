import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveWhatsappSession } from "@/lib/prescreen/repository";

/**
 * Multi-job tiebreak for getActiveWhatsappSession: a new invite on job B must not
 * steal replies from a round the candidate is actively answering on job A.
 */

type SessionRow = {
  id: string;
  application_id: string | null;
  job_id: string;
  candidate_id: string;
  channel: string;
  stage: string;
  state: string;
  current_question_index: number;
  questions_sent_at: string | null;
  reminder_sent_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
};

function session(over: Partial<SessionRow>): SessionRow {
  return {
    id: "sess-x",
    application_id: null,
    job_id: "job-x",
    candidate_id: "cand-1",
    channel: "whatsapp",
    stage: "post_shortlist",
    state: "awaiting_reply",
    current_question_index: 0,
    questions_sent_at: "2026-07-09T10:00:00.000Z",
    reminder_sent_at: null,
    completed_at: null,
    declined_at: null,
    created_at: "2026-07-09T10:00:00.000Z",
    updated_at: "2026-07-09T10:00:00.000Z",
    ...over,
  };
}

type Filter = { method: string; args: unknown[] };

/**
 * Thenable query stub. `sessions` must already be sorted newest-first
 * (the real query orders by questions_sent_at desc).
 * `responsesByJob` -> prescreen_responses rows per job for the candidate.
 * `questionStageById` -> ask_stage per question id (drives the stage-scoping query).
 */
function makeAdmin(opts: {
  sessions: SessionRow[];
  responsesByJob?: Record<string, Array<{ question_id: string }>>;
  questionStageById?: Record<string, string>;
}): SupabaseClient {
  return {
    from(table: string) {
      const filters: Filter[] = [];
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "order", "limit"]) {
        builder[m] = (...args: unknown[]) => {
          filters.push({ method: m, args });
          return builder;
        };
      }
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
        let data: unknown[] = [];
        if (table === "prescreen_sessions") {
          data = opts.sessions;
        } else if (table === "prescreen_responses") {
          const jobEq = filters.find((f) => f.method === "eq" && f.args[0] === "job_id");
          data = opts.responsesByJob?.[String(jobEq?.args[1])] ?? [];
        } else if (table === "prescreen_questions") {
          const inIds = filters.find((f) => f.method === "in" && f.args[0] === "id");
          const stageEq = filters.find((f) => f.method === "eq" && f.args[0] === "ask_stage");
          const ids = (inIds?.args[1] as string[]) ?? [];
          data = ids
            .filter((id) => (opts.questionStageById?.[id] ?? null) === stageEq?.args[1])
            .map((id) => ({ id }));
        }
        resolve({ data, error: null });
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("getActiveWhatsappSession — multi-job tiebreak", () => {
  const midRound = session({
    id: "sess-a",
    job_id: "job-a",
    state: "awaiting_reply",
    questions_sent_at: "2026-07-08T10:00:00.000Z",
  });
  const newInvite = session({
    id: "sess-b",
    job_id: "job-b",
    state: "awaiting_consent",
    questions_sent_at: "2026-07-10T10:00:00.000Z",
  });

  it("prefers the mid-questions session over a NEWER awaiting_consent invite on another job", async () => {
    const admin = makeAdmin({
      sessions: [newInvite, midRound], // newest first: invite is newer
      responsesByJob: { "job-a": [{ question_id: "q-a1" }] },
      questionStageById: { "q-a1": "post_shortlist" },
    });
    const result = await getActiveWhatsappSession(admin, "cand-1");
    expect(result?.id).toBe("sess-a");
  });

  it("prefers the mid-questions session when it is the newer one too (both orders hold)", async () => {
    const newerMidRound = session({
      id: "sess-a2",
      job_id: "job-a",
      state: "reminded",
      questions_sent_at: "2026-07-10T12:00:00.000Z",
    });
    const olderInvite = session({
      id: "sess-b2",
      job_id: "job-b",
      state: "awaiting_consent",
      questions_sent_at: "2026-07-08T10:00:00.000Z",
    });
    const admin = makeAdmin({
      sessions: [newerMidRound, olderInvite], // newest first: mid-round is newer
      responsesByJob: { "job-a": [{ question_id: "q-a1" }] },
      questionStageById: { "q-a1": "post_shortlist" },
    });
    const result = await getActiveWhatsappSession(admin, "cand-1");
    expect(result?.id).toBe("sess-a2");
  });

  it("falls back to the newest session when no open session is mid-questions", async () => {
    // awaiting_reply but with zero recorded answers is NOT mid-round (the state is
    // also the ensureSession default), so the newest invite wins as before.
    const admin = makeAdmin({
      sessions: [newInvite, midRound],
      responsesByJob: {},
    });
    const result = await getActiveWhatsappSession(admin, "cand-1");
    expect(result?.id).toBe("sess-b");
  });

  it("does not count answers from a different stage as mid-round engagement", async () => {
    // job-a only has an APPLY-stage answer; its post_shortlist session is not
    // mid-round, so the newer invite on job-b still wins.
    const admin = makeAdmin({
      sessions: [newInvite, midRound],
      responsesByJob: { "job-a": [{ question_id: "q-apply" }] },
      questionStageById: { "q-apply": "apply" },
    });
    const result = await getActiveWhatsappSession(admin, "cand-1");
    expect(result?.id).toBe("sess-b");
  });

  it("returns the single open session untouched (no tiebreak queries)", async () => {
    const admin = makeAdmin({ sessions: [midRound] });
    const result = await getActiveWhatsappSession(admin, "cand-1");
    expect(result?.id).toBe("sess-a");
  });

  it("returns null when there is no open session", async () => {
    const admin = makeAdmin({ sessions: [] });
    expect(await getActiveWhatsappSession(admin, "cand-1")).toBeNull();
  });
});
