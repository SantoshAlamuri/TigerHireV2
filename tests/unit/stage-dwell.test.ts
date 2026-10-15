import { describe, it, expect, vi } from "vitest";
import { getStageDwell } from "@/lib/analytics/stage-dwell";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("getStageDwell", () => {
  it("aggregates samples by job and stage with median and counts", async () => {
    const samples = [
      {
        job_id: "j1",
        job_title: "Engineer",
        to_stage: "Interview",
        candidate_id: "c1",
        entered_at: "2026-01-01T00:00:00Z",
        dwell_days: 2,
      },
      {
        job_id: "j1",
        job_title: "Engineer",
        to_stage: "Interview",
        candidate_id: "c2",
        entered_at: "2026-01-02T00:00:00Z",
        dwell_days: 4,
      },
      {
        job_id: "j1",
        job_title: "Engineer",
        to_stage: "Interview",
        candidate_id: "c1",
        entered_at: "2026-01-03T00:00:00Z",
        dwell_days: 6,
      },
    ];

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: samples, error: null })),
      })),
    } as unknown as SupabaseClient;

    const rows = await getStageDwell(supabase, "org-1", {});
    expect(rows).toHaveLength(1);
    expect(rows[0].job_id).toBe("j1");
    expect(rows[0].to_stage).toBe("Interview");
    expect(rows[0].sample_size).toBe(3);
    expect(rows[0].candidate_count).toBe(2);
    expect(rows[0].median_days).toBe(4);
    expect(rows[0].avg_days).toBe(4);
  });
});
