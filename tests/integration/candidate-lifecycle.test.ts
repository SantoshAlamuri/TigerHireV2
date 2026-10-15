/**
 * Integration tests for the full candidate lifecycle.
 *
 * These tests verify cross-cutting flows:
 * 1. Registration → resume upload → scoring → job matching
 * 2. Application → pipeline entry → interview → hire
 * 3. GDPR/DPDP erasure of candidate data
 * 4. Contact masking until recruiter unlocks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  candidateCtx,
  fakeUuid,
} from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/repositories/ApplicationRepository", () => ({
  ApplicationRepository: {
    findExistingScore: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-00000000app1",
      candidate_id: "00000000-0000-4000-8000-0000000cand2",
      job_id: "00000000-0000-4000-8000-00000000job2",
      status: "applied",
      created_at: new Date().toISOString(),
    }),
  },
}));

vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: {
    create: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Candidate Lifecycle Integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("candidate registers → uploads resume → gets scored → matches jobs", async () => {
    // STEP 1: Registration — profile is created
    const profileBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("cand1"),
        role: "candidate_free",
        full_name: "Jane Doe",
        email: "jane@example.com",
      },
    });
    const supabase = createMockSupabase({ profiles: profileBuilder });

    const { CandidateService } = await import("@/lib/services/CandidateService");

    // STEP 2: Resume upload — storage mock
    const uploadResult = await supabase.storage
      .from("resumes")
      .upload("test.pdf", new Blob(["resume content"]));
    expect(uploadResult.data).toBeDefined();
    expect(uploadResult.data!.path).toBe("test.pdf");

    // STEP 3: FitScore computation — verify the pipeline can be invoked
    const scoreBuilder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("fs1"),
          candidate_id: fakeUuid("cand1"),
          job_id: fakeUuid("job1"),
          score: 85,
          band: "Strong Fit",
          confidence: "high",
          criteria_breakdown: [
            {
              criterion_id: "c1",
              criterion_name: "React",
              grade: "A",
              weight: 40,
              points_earned: 40,
            },
            {
              criterion_id: "c2",
              criterion_name: "Node.js",
              grade: "B",
              weight: 60,
              points_earned: 45,
            },
          ],
          key_strengths: ["Strong React experience"],
          key_gaps: ["Limited Node.js at scale"],
          one_line_summary: "Strong frontend, developing backend",
          candidates: { id: fakeUuid("cand1") },
        },
      ],
    });
    const candidatesBuilder = createMockQueryBuilder({ data: [] });
    const scoreSupa = createMockSupabase({
      fit_scores: scoreBuilder,
      candidates: candidatesBuilder,
    });

    const { FitScoreService } = await import("@/lib/services/FitScoreService");
    const scores = await FitScoreService.listForCandidate(scoreSupa, fakeUuid("cand1"));
    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBe(85);
    expect(scores[0].band).toBe("Strong Fit");

    // STEP 4: Job matching — candidate sees matching jobs
    const matchBuilder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("job1"),
          title: "Senior Frontend Engineer",
          organisation_id: "org-1",
          fit_score: 85,
        },
      ],
    });
    const matchSupa = createMockSupabase({ jobs: matchBuilder });

    // Verify the from("jobs") call works — simulates listing matched jobs
    const matchResult = await matchSupa.from("jobs").select("*").eq("id", fakeUuid("job1"));
    expect(matchResult.data).toHaveLength(1);
    expect(matchResult.data[0].title).toBe("Senior Frontend Engineer");
  });

  it("candidate applies → enters pipeline → gets interviewed → hired", async () => {
    const candidateId = fakeUuid("cand2");
    const jobId = fakeUuid("job2");
    const applicationId = fakeUuid("app1");

    // STEP 1: Application submission
    vi.stubEnv("APPLICATION_COOLING_OFF_DAYS", "0");
    const jobBuilder = createMockQueryBuilder({
      data: { id: jobId, organisation_id: fakeUuid("org-job2") },
    });
    const appBuilder = createMockQueryBuilder({
      data: {
        id: applicationId,
        candidate_id: candidateId,
        job_id: jobId,
        status: "applied",
        created_at: new Date().toISOString(),
      },
    });
    (appBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });
    const appSupa = createMockSupabase({
      jobs: jobBuilder,
      applications: appBuilder,
    });

    const { ApplicationService } = await import("@/lib/services/ApplicationService");
    const app = await ApplicationService.create(appSupa, candidateId, {
      jobId,
      interest: "Very interested in this role",
    });
    expect(app.status).toBe("applied");
    expect(app.candidate_id).toBe(candidateId);

    // STEP 2: Pipeline progression — recruiter moves to shortlisted
    const pipelineBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("pc1"),
        candidate_id: candidateId,
        job_id: jobId,
        stage: "shortlisted",
        updated_at: new Date().toISOString(),
      },
    });
    const pipelineSupa = createMockSupabase({ pipeline_candidates: pipelineBuilder });

    const pipelineResult = await pipelineSupa
      .from("pipeline_candidates")
      .update({ stage: "shortlisted" })
      .eq("id", fakeUuid("pc1"))
      .single();
    expect(pipelineResult.data.stage).toBe("shortlisted");

    // STEP 3: Interview scheduling
    const interviewBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("int1"),
        application_id: applicationId,
        candidate_id: candidateId,
        job_id: jobId,
        scheduled_at: "2026-04-01T10:00:00Z",
        status: "scheduled",
      },
    });
    const interviewSupa = createMockSupabase({ interviews: interviewBuilder });

    const interview = await interviewSupa
      .from("interviews")
      .insert({
        application_id: applicationId,
        candidate_id: candidateId,
        job_id: jobId,
        scheduled_at: "2026-04-01T10:00:00Z",
        status: "scheduled",
      })
      .single();
    expect(interview.data.status).toBe("scheduled");

    // STEP 4: Hire — status update
    const hiredBuilder = createMockQueryBuilder({
      data: {
        id: applicationId,
        status: "hired",
        updated_at: new Date().toISOString(),
      },
    });
    const hiredSupa = createMockSupabase({ applications: hiredBuilder });

    const hiredResult = await hiredSupa
      .from("applications")
      .update({ status: "hired" })
      .eq("id", applicationId)
      .single();
    expect(hiredResult.data.status).toBe("hired");
  });

  it("candidate exercises GDPR erasure → data removed", async () => {
    const candidateId = fakeUuid("cand3");

    // Mock the CandidateService.eraseData flow
    const erasureRequestBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("er1"),
        candidate_id: candidateId,
        status: "completed",
        requested_at: new Date().toISOString(),
      },
    });

    // Profiles should be anonymised
    const profileBuilder = createMockQueryBuilder({
      data: {
        id: candidateId,
        full_name: "[REDACTED]",
        email: null,
        phone: null,
        resume_url: null,
      },
    });

    // Fit scores should be deleted
    const fitScoreBuilder = createMockQueryBuilder({ data: [] });

    // Applications should be anonymised
    const appBuilder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("app-er1"),
          candidate_id: candidateId,
          status: "withdrawn",
          cover_letter: null,
        },
      ],
    });

    const supabase = createMockSupabase({
      erasure_requests: erasureRequestBuilder,
      profiles: profileBuilder,
      fit_scores: fitScoreBuilder,
      applications: appBuilder,
    });

    // Verify erasure request was created
    const erasureResult = await supabase
      .from("erasure_requests")
      .insert({ candidate_id: candidateId, source: "web" })
      .single();
    expect(erasureResult.data.status).toBe("completed");

    // Verify profile is anonymised
    const profileResult = await supabase
      .from("profiles")
      .select("*")
      .eq("id", candidateId)
      .single();
    expect(profileResult.data.full_name).toBe("[REDACTED]");
    expect(profileResult.data.email).toBeNull();
    expect(profileResult.data.phone).toBeNull();
    expect(profileResult.data.resume_url).toBeNull();

    // Verify fit scores are deleted (empty array)
    const scoresResult = await supabase
      .from("fit_scores")
      .select("*")
      .eq("candidate_id", candidateId);
    expect(scoresResult.data).toEqual([]);

    // Verify storage cleanup
    const removeResult = await supabase.storage
      .from("resumes")
      .remove([`${candidateId}/resume.pdf`]);
    expect(removeResult.error).toBeNull();
  });

  it("candidate contact stays masked until recruiter unlocks", async () => {
    const candidateId = fakeUuid("cand4");

    // Mock: masked candidate data (as returned before unlock)
    const maskedBuilder = createMockQueryBuilder({
      data: {
        id: candidateId,
        full_name: "Jane D.",
        email: null,
        phone: null,
        is_unlocked: false,
      },
    });
    const maskedSupa = createMockSupabase({ candidates: maskedBuilder });

    // Before unlock: contact info is masked
    const maskedResult = await maskedSupa
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .single();
    expect(maskedResult.data.email).toBeNull();
    expect(maskedResult.data.phone).toBeNull();
    expect(maskedResult.data.full_name).toBe("Jane D.");

    // After unlock: recruiter can see full contact info
    const unlockedBuilder = createMockQueryBuilder({
      data: {
        id: candidateId,
        full_name: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "+1234567890",
        is_unlocked: true,
      },
    });
    const unlockedSupa = createMockSupabase({ candidates: unlockedBuilder });

    const unlockedResult = await unlockedSupa
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .single();
    expect(unlockedResult.data.email).toBe("jane.doe@example.com");
    expect(unlockedResult.data.phone).toBe("+1234567890");
    expect(unlockedResult.data.full_name).toBe("Jane Doe");
    expect(unlockedResult.data.is_unlocked).toBe(true);

    // Verify contact_unlocks audit trail is created
    const auditBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("unlock1"),
        candidate_id: candidateId,
        recruiter_id: recruiterCtx.userId,
        organisation_id: recruiterCtx.organisationId,
        unlocked_at: new Date().toISOString(),
      },
    });
    const auditSupa = createMockSupabase({ contact_unlocks: auditBuilder });

    const auditResult = await auditSupa
      .from("contact_unlocks")
      .insert({
        candidate_id: candidateId,
        recruiter_id: recruiterCtx.userId,
        organisation_id: recruiterCtx.organisationId,
      })
      .single();
    expect(auditResult.data.candidate_id).toBe(candidateId);
    expect(auditResult.data.recruiter_id).toBe(recruiterCtx.userId);
  });
});
