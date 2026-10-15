import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockProcessReminder = vi.fn();
const mockGetApprovedJdBase = vi.fn();

vi.mock("@/lib/prescreen/lifecycle", () => ({
  processPrescreenReminder: (...args: unknown[]) => mockProcessReminder(...args),
}));

vi.mock("@/lib/prescreen/repository", () => ({
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sweepDuePrescreenReminders } from "@/lib/prescreen/reminder-sweep";

function makeAdmin(rows: {
  sessions: unknown[];
  candidatePhone: string | null;
  jobOrganisationId: string | null;
}): SupabaseClient {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "is", "not", "lt"]) {
        builder[m] = () => builder;
      }
      builder.limit = async () => ({
        data: table === "prescreen_sessions" ? rows.sessions : [],
        error: null,
      });
      builder.maybeSingle = async () => {
        if (table === "candidates") {
          return { data: { phone: rows.candidatePhone }, error: null };
        }
        if (table === "jobs") {
          return { data: { organisation_id: rows.jobOrganisationId }, error: null };
        }
        return { data: null, error: null };
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const dueSession = {
  id: "sess-1",
  job_id: "job-1",
  candidate_id: "cand-1",
  channel: "whatsapp",
  questions_sent_at: "2026-07-08T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApprovedJdBase.mockResolvedValue({ id: "jd-1", roleTitle: "Lead BA" });
  mockProcessReminder.mockResolvedValue({ sent: true });
});

describe("sweepDuePrescreenReminders", () => {
  it("resolves the organisation id from the job so template fallbacks name the company", async () => {
    const admin = makeAdmin({
      sessions: [dueSession],
      candidatePhone: "919999900001",
      jobOrganisationId: "org-1",
    });

    const result = await sweepDuePrescreenReminders(admin);

    expect(result).toEqual({ scanned: 1, sent: 1 });
    expect(mockProcessReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        jobId: "job-1",
        candidateId: "cand-1",
        organisationId: "org-1", // was hardcoded null -> "at the hiring team" copy
        jdBaseDocumentId: "jd-1",
        phone: "919999900001",
      }),
    );
  });

  it("passes a null organisation id through when the job has none", async () => {
    const admin = makeAdmin({
      sessions: [dueSession],
      candidatePhone: "919999900001",
      jobOrganisationId: null,
    });

    await sweepDuePrescreenReminders(admin);

    expect(mockProcessReminder).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: null }),
    );
  });

  it("skips sessions whose candidate has no phone", async () => {
    const admin = makeAdmin({
      sessions: [dueSession],
      candidatePhone: null,
      jobOrganisationId: "org-1",
    });

    const result = await sweepDuePrescreenReminders(admin);

    expect(result).toEqual({ scanned: 1, sent: 0 });
    expect(mockProcessReminder).not.toHaveBeenCalled();
  });
});
