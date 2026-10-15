import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncGatingQuestionsPreservingAnswers } from "@/lib/prescreen/question-sync";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Call = {
  table: string;
  op: "delete" | "update" | "insert";
  payload?: unknown;
  ids?: string[];
};

/**
 * Chainable admin mock: serves reads for prescreen_questions (existing rows)
 * and prescreen_responses (answered question ids); records writes.
 */
function makeAdmin(
  existing: Array<{ id: string; question_text: string }>,
  answeredQuestionIds: string[],
) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const ctx: { op?: Call["op"]; payload?: unknown; ids?: string[] } = {};
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        in: (_col: string, ids: string[]) => {
          ctx.ids = ids;
          return builder;
        },
        delete: () => {
          ctx.op = "delete";
          return builder;
        },
        update: (payload: unknown) => {
          ctx.op = "update";
          ctx.payload = payload;
          return builder;
        },
        insert: (payload: unknown) => {
          ctx.op = "insert";
          ctx.payload = payload;
          calls.push({ table, op: "insert", payload });
          return Promise.resolve({ error: null });
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (ctx.op) {
            calls.push({ table, op: ctx.op, payload: ctx.payload, ids: ctx.ids });
            resolve({ data: null, error: null });
            return;
          }
          if (table === "prescreen_questions") {
            resolve({ data: existing, error: null });
            return;
          }
          if (table === "prescreen_responses") {
            const requested = ctx.ids ?? [];
            resolve({
              data: answeredQuestionIds
                .filter((id) => requested.includes(id))
                .map((question_id) => ({ question_id })),
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
      });
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

const draft = (question_text: string) => ({
  question_text,
  requirement_id: null,
  answer_type: "yes_no",
  options: ["Yes", "No"],
  gating: true,
});

describe("syncGatingQuestionsPreservingAnswers", () => {
  it("keeps unchanged questions (same id) and inserts only new ones", async () => {
    const { admin, calls } = makeAdmin(
      [
        { id: "q-1", question_text: "Do you have 5+ years?" },
        { id: "q-2", question_text: "Are you hands-on with SQL?" },
      ],
      ["q-1", "q-2"],
    );

    const result = await syncGatingQuestionsPreservingAnswers(admin, "jd-1", "post_shortlist", [
      draft("Do you have 5+ years?"),
      draft("Are you hands-on with SQL?"),
      draft("Can you work from Bangalore?"),
    ]);

    expect(result).toEqual({ kept: 2, inserted: 1, deleted: 0, retired: 0 });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.payload).toEqual([
      expect.objectContaining({ question_text: "Can you work from Bangalore?" }),
    ]);
  });

  it("retires answered questions instead of deleting them", async () => {
    const { admin, calls } = makeAdmin(
      [{ id: "q-old", question_text: "Old answered question?" }],
      ["q-old"],
    );

    const result = await syncGatingQuestionsPreservingAnswers(admin, "jd-1", "post_shortlist", [
      draft("Brand new question?"),
    ]);

    expect(result).toEqual({ kept: 0, inserted: 1, deleted: 0, retired: 1 });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({ gating: false });
    expect(update?.ids).toEqual(["q-old"]);
  });

  it("deletes removed questions only when nobody answered them", async () => {
    const { admin, calls } = makeAdmin(
      [{ id: "q-unanswered", question_text: "Never answered?" }],
      [],
    );

    const result = await syncGatingQuestionsPreservingAnswers(admin, "jd-1", "apply", [
      draft("Replacement question?"),
    ]);

    expect(result).toEqual({ kept: 0, inserted: 1, deleted: 1, retired: 0 });
    const del = calls.find((c) => c.op === "delete");
    expect(del?.ids).toEqual(["q-unanswered"]);
  });

  it("matches question text case- and whitespace-insensitively", async () => {
    const { admin, calls } = makeAdmin(
      [{ id: "q-1", question_text: "Do you  have 5+ years?" }],
      ["q-1"],
    );

    const result = await syncGatingQuestionsPreservingAnswers(admin, "jd-1", "apply", [
      draft("do you have 5+ YEARS?"),
    ]);

    expect(result).toEqual({ kept: 1, inserted: 0, deleted: 0, retired: 0 });
    expect(calls).toHaveLength(0);
  });
});
