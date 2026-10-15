import { describe, expect, it, vi } from "vitest";

const mockWarn = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: (...a: unknown[]) => mockWarn(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getActiveWhatsappSession } from "@/lib/prescreen/repository";
import type { PrescreenSession } from "@/lib/prescreen/types";

function sess(id: string, jobId: string): PrescreenSession {
  return {
    id,
    job_id: jobId,
    candidate_id: "c1",
    channel: "whatsapp",
    // awaiting_consent so the mid-round heuristic loop is skipped (no responses query).
    state: "awaiting_consent",
    stage: "gate",
    current_question_index: 0,
    questions_sent_at: "2026-07-01T00:00:00Z",
    reminder_sent_at: null,
    completed_at: null,
    declined_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  } as unknown as PrescreenSession;
}

type Job = { id: string; organisation_id: string | null };
function makeAdmin(sessions: PrescreenSession[], jobs: Job[]) {
  const ps: Record<string, unknown> = {};
  ps.select = () => ps;
  ps.eq = () => ps;
  ps.neq = () => ps;
  ps.order = () => Promise.resolve({ data: sessions, error: null });

  const jt: Record<string, unknown> = {};
  jt.select = () => jt;
  jt.in = () => Promise.resolve({ data: jobs, error: null });

  return { from: (t: string) => (t === "prescreen_sessions" ? ps : jt) } as never;
}

describe("getActiveWhatsappSession cross-org scoping", () => {
  it("returns the only session without an org query", async () => {
    const admin = makeAdmin([sess("s1", "jobA")], []);
    const res = await getActiveWhatsappSession(admin, "c1");
    expect(res?.id).toBe("s1");
  });

  it("scopes a cross-org collision to the stamped session org (preferOrgId)", async () => {
    const admin = makeAdmin(
      [sess("sA", "jobA"), sess("sB", "jobB")],
      [
        { id: "jobA", organisation_id: "orgA" },
        { id: "jobB", organisation_id: "orgB" },
      ],
    );
    const res = await getActiveWhatsappSession(admin, "c1", { preferOrgId: "orgB" });
    // Reply is scoped to org B's gate, not the recency default (org A).
    expect(res?.id).toBe("sB");
    expect(mockWarn).toHaveBeenCalledWith(
      "prescreen_whatsapp_cross_org_collision",
      expect.objectContaining({ distinct_orgs: 2, scoped_to_session_org: true }),
    );
  });

  it("logs the collision and keeps the recency default when no org is known", async () => {
    mockWarn.mockClear();
    const admin = makeAdmin(
      [sess("sA", "jobA"), sess("sB", "jobB")],
      [
        { id: "jobA", organisation_id: "orgA" },
        { id: "jobB", organisation_id: "orgB" },
      ],
    );
    const res = await getActiveWhatsappSession(admin, "c1");
    expect(res?.id).toBe("sA"); // recency order preserved
    expect(mockWarn).toHaveBeenCalledWith(
      "prescreen_whatsapp_cross_org_collision",
      expect.objectContaining({ scoped_to_session_org: false }),
    );
  });

  it("does not treat same-org multi-job as a collision", async () => {
    mockWarn.mockClear();
    const admin = makeAdmin(
      [sess("sA", "jobA"), sess("sB", "jobA2")],
      [
        { id: "jobA", organisation_id: "orgA" },
        { id: "jobA2", organisation_id: "orgA" },
      ],
    );
    const res = await getActiveWhatsappSession(admin, "c1", { preferOrgId: "orgA" });
    expect(res?.id).toBe("sA");
    expect(mockWarn).not.toHaveBeenCalledWith(
      "prescreen_whatsapp_cross_org_collision",
      expect.anything(),
    );
  });
});
