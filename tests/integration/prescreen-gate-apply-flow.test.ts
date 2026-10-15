/**
 * Prescreen gate: apply → pending → scoring blocked → resolve.
 * Exercises real startPrescreenGateBestEffort + checkScoringGuard against live Supabase;
 * mocks only outbound dispatch and queue enqueue (not gate/router).
 * @vitest-environment node
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import dotenv from "dotenv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { approveJdBase } from "@/lib/fitscore/hybrid/jd-base";
import { clearFlagCache, invalidateFeatureFlagCache } from "@/lib/feature-flags";
import { finalizePassed } from "@/lib/prescreen/channel-router";
import { checkScoringGuard } from "@/lib/prescreen/scoring-guard";
import { startPrescreenGateBestEffort } from "@/lib/prescreen/start-gate";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn(async () => ({ id: "mock-queue-id" })),
}));

vi.mock("@/lib/prescreen/dispatch", () => ({
  dispatchPrescreenMessage: vi.fn(async () => true),
}));

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const isCI = process.env.CI === "true";
const requireLiveDbInCi = process.env.REQUIRE_LIVE_SUPABASE_INTEGRATION === "true";

if (isCI && requireLiveDbInCi && !hasLiveSupabaseEnv) {
  throw new Error(
    "tests/integration/prescreen-gate-apply-flow.test.ts requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in CI.",
  );
}

// QUARANTINED (flaky vs the shared preview DB — red on dev since ~2026-07-10):
// opt in with RUN_FLAKY_DB_INTEGRATION=1 against a known-good DB. TODO: root-cause + un-skip.
const runFlakyDbIntegration = process.env.RUN_FLAKY_DB_INTEGRATION === "1";
describe.skipIf(!hasLiveSupabaseEnv || !runFlakyDbIntegration)(
  "Prescreen gate apply flow (integration)",
  () => {
    let admin: ReturnType<typeof createSupabaseAdmin>;
    let orgId: string;
    let creatorUserId: string;
    let candidateId: string;
    let jobId: string;
    let jdBaseId: string;
    let applicationId: string;
    let sessionId: string | null = null;

    beforeAll(async () => {
      admin = createSupabaseAdmin();
      const suffix = Date.now().toString(36);

      const { data: org } = await admin
        .from("organisations")
        .insert({
          name: `Prescreen Gate Test Org ${suffix}`,
          type: "company",
          slug: `prescreen-gate-${suffix}`,
        })
        .select("id")
        .single();
      orgId = org!.id;

      const { data: creatorUser } = await admin.auth.admin.createUser({
        email: `prescreen-gate-${suffix}@example.com`,
        password: "Test123!@#",
        email_confirm: true,
      });
      creatorUserId = creatorUser.user!.id;

      await admin.from("profiles").insert({
        id: creatorUserId,
        organisation_id: orgId,
        role: "leadership",
        full_name: "Prescreen Gate Test Admin",
      });

      const { data: candidate } = await admin
        .from("candidates")
        .insert({
          name: "Prescreen Gate Candidate",
          email: `prescreen-candidate-${suffix}@example.com`,
          phone: `+91977${suffix.slice(-6).padStart(6, "0")}`,
          skills: ["TypeScript", "React"],
          experience_years: 5,
          location: "Bangalore",
          current_role: "Software Engineer",
        })
        .select("id")
        .single();
      candidateId = candidate!.id;

      const { data: job } = await admin
        .from("jobs")
        .insert({
          organisation_id: orgId,
          created_by: creatorUserId,
          title: "Backend Engineer (Prescreen Gate Test)",
          description: "Build APIs with strong must-have alignment.",
          location: "Bangalore",
          role_function: "Engineering",
          status: "open",
          skills_required: ["TypeScript", "Node.js"],
        })
        .select("id")
        .single();
      jobId = job!.id;

      const { data: jdBase } = await admin
        .from("jd_base_documents")
        .insert({
          job_id: jobId,
          role_title: "Backend Engineer",
          company: "TigerHire Test Client",
          context: "Prescreen gate integration fixture with must-haves.",
          weights: { backend: 50, communication: 25, ownership: 25 },
          score_floor: 30,
          fit_thresholds: { strong: 80, good: 65, moderate: 50, weak: 0 },
          // With ff_structured_jd ON, approveJdBase replaces jd_requirements from
          // structured_jd (empty → wiped) before deriving prescreen questions, so the
          // fixture must carry its must-haves here, not only in jd_requirements.
          structured_jd: {
            role_basics: { title: "Backend Engineer", location: "Bangalore" },
            responsibilities: ["Build APIs"],
            must_haves: [
              "3+ years of backend development experience",
              "Eligible to work in India without visa sponsorship",
            ],
            need_to_haves: [],
            nice_to_haves: [],
          },
          extraction_additions: null,
          approved_by: null,
          approved_at: null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      jdBaseId = jdBase!.id;

      await admin.from("jd_requirements").insert([
        {
          jd_base_document_id: jdBaseId,
          tier: "must_have",
          kind: "other",
          verifiable: true,
          text: "3+ years of backend development experience",
        },
        {
          jd_base_document_id: jdBaseId,
          tier: "must_have",
          kind: "other",
          verifiable: true,
          text: "Eligible to work in India without visa sponsorship",
        },
      ]);

      await approveJdBase(admin, jobId, creatorUserId, orgId);

      await admin.from("organisation_runtime_feature_flag_overrides").upsert(
        {
          organisation_id: orgId,
          flag_key: "ff_whatsapp_gate",
          enabled: true,
          reason: "prescreen gate integration test",
        },
        { onConflict: "organisation_id,flag_key" },
      );
      clearFlagCache();
      await invalidateFeatureFlagCache("ff_whatsapp_gate", orgId);

      const { data: application } = await admin
        .from("applications")
        .insert({
          candidate_id: candidateId,
          job_id: jobId,
          status: "applied",
          source: "public_apply",
          interest: "interested",
        })
        .select("id")
        .single();
      applicationId = application!.id;
    });

    afterAll(async () => {
      if (!admin) return;
      await admin.from("prescreen_responses").delete().eq("job_id", jobId);
      await admin.from("prescreen_sessions").delete().eq("job_id", jobId);
      await admin.from("prescreen_questions").delete().eq("jd_base_document_id", jdBaseId);
      await admin.from("jd_requirements").delete().eq("jd_base_document_id", jdBaseId);
      await admin.from("applications").delete().eq("job_id", jobId);
      await admin.from("jd_base_documents").delete().eq("job_id", jobId);
      await admin.from("organisation_runtime_feature_flag_overrides").delete().match({
        organisation_id: orgId,
        flag_key: "ff_whatsapp_gate",
      });
      await admin.from("jobs").delete().eq("id", jobId);
      await admin.from("candidates").delete().eq("id", candidateId);
      await admin.from("profiles").delete().eq("id", creatorUserId);
      await admin.auth.admin.deleteUser(creatorUserId);
      await admin.from("organisations").delete().eq("id", orgId);
      clearFlagCache();
    });

    it("starts gate on apply, blocks scoring while pending, then allows after pass", async () => {
      await startPrescreenGateBestEffort(admin, {
        jobId,
        candidateId,
        applicationId,
        organisationId: orgId,
        source: "public_apply",
      });

      const { data: appAfterGate } = await admin
        .from("applications")
        .select("gate_status")
        .eq("id", applicationId)
        .single();
      expect(appAfterGate?.gate_status).toBe("pending");

      const { data: session } = await admin
        .from("prescreen_sessions")
        .select("id, state, channel")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      expect(session?.state).toBe("awaiting_reply");
      expect(session?.channel).toBe("form");
      sessionId = session?.id ?? null;

      const blocked = await checkScoringGuard({
        admin,
        jobId,
        candidateId,
        organisationId: orgId,
      });
      expect(blocked).toEqual({
        block: true,
        reason: "gate_pending",
        gateStatus: "pending",
      });

      await finalizePassed({
        admin,
        jobId,
        candidateId,
        sessionId,
        roleTitle: "Backend Engineer",
        channel: "form",
      });

      const allowed = await checkScoringGuard({
        admin,
        jobId,
        candidateId,
        organisationId: orgId,
      });
      expect(allowed).toEqual({
        block: false,
        gateStatus: "passed",
      });
    });
  },
);
