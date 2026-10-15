/**
 * Prescreen gate soak: WhatsApp YES on Q1 → NO on Q2 → gated out, no LLM score.
 * Load-bearing scenario — proves fail-closed before external beta.
 *
 * Runs only against staging when explicitly opted in (never accidental prod):
 *   PRESCREEN_SOAK_STAGING=1
 *   NEXT_PUBLIC_SUPABASE_URL=https://qzhhhsvtyqyixpcdfhng.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<staging service role>
 *
 * Uses Finstack Demo JD fixture from scripts/sql/prescreen-soak-staging-setup.sql.
 * @vitest-environment node
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import dotenv from "dotenv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { clearFlagCache } from "@/lib/feature-flags";
import { checkScoringGuard } from "@/lib/prescreen/scoring-guard";
import { startPrescreenGateBestEffort } from "@/lib/prescreen/start-gate";
import { handlePrescreenWhatsappReply } from "@/lib/prescreen/whatsapp-inbound";
import { FitScoreService } from "@/lib/services/FitScoreService";

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

const STAGING_PROJECT_REF = "qzhhhsvtyqyixpcdfhng";
const SOAK_JOB_ID = "1efb213a-5c92-4db4-a0d9-5fa0268b25c1";
const SOAK_ORG_ID = "2716ae2d-41b0-4505-be8a-2e0da281cb37";

const soakStagingEnabled =
  process.env.PRESCREEN_SOAK_STAGING === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_PROJECT_REF)) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!soakStagingEnabled)(
  "Prescreen gate WhatsApp NO-on-Q2 soak (staging fixture)",
  () => {
    let admin: ReturnType<typeof createSupabaseAdmin>;
    let candidateId: string;
    let applicationId: string;
    const phone = `+91988${Date.now().toString().slice(-7)}`;

    beforeAll(async () => {
      process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS = "0";
      admin = createSupabaseAdmin();
      clearFlagCache();

      const suffix = Date.now().toString(36);
      const { data: candidate, error } = await admin
        .from("candidates")
        .insert({
          name: `Soak NO-Q2 ${suffix}`,
          email: `soak-no-q2-${suffix}@example.com`,
          phone,
          skills: ["TypeScript"],
          experience_years: 4,
          location: "Bangalore",
        })
        .select("id")
        .single();
      if (error) throw error;
      candidateId = candidate!.id;

      const { data: application, error: appErr } = await admin
        .from("applications")
        .insert({
          candidate_id: candidateId,
          job_id: SOAK_JOB_ID,
          status: "applied",
          source: "whatsapp",
          interest: "interested",
        })
        .select("id")
        .single();
      if (appErr) throw appErr;
      applicationId = application!.id;
    });

    afterAll(async () => {
      if (!admin) return;
      await admin
        .from("fit_scores")
        .delete()
        .eq("job_id", SOAK_JOB_ID)
        .eq("candidate_id", candidateId);
      await admin
        .from("prescreen_responses")
        .delete()
        .eq("job_id", SOAK_JOB_ID)
        .eq("candidate_id", candidateId);
      await admin
        .from("prescreen_sessions")
        .delete()
        .eq("job_id", SOAK_JOB_ID)
        .eq("candidate_id", candidateId);
      await admin.from("applications").delete().eq("id", applicationId);
      await admin.from("candidates").delete().eq("id", candidateId);
      clearFlagCache();
    });

    it("Q1 YES then Q2 NO → failed gate, Gated Out row, scoring guard blocks LLM", async () => {
      await startPrescreenGateBestEffort(admin, {
        jobId: SOAK_JOB_ID,
        candidateId,
        applicationId,
        organisationId: SOAK_ORG_ID,
        source: "whatsapp",
        phone,
      });

      const { data: pendingApp } = await admin
        .from("applications")
        .select("gate_status")
        .eq("id", applicationId)
        .single();
      expect(pendingApp?.gate_status).toBe("pending");

      const q1Handled = await handlePrescreenWhatsappReply({
        phone,
        body: "yes",
        candidateId,
      });
      expect(q1Handled).toBe(true);

      const q2Handled = await handlePrescreenWhatsappReply({
        phone,
        body: "no",
        candidateId,
      });
      expect(q2Handled).toBe(true);

      const { data: failedApp } = await admin
        .from("applications")
        .select("gate_status")
        .eq("id", applicationId)
        .single();
      expect(failedApp?.gate_status).toBe("failed");

      const guard = await checkScoringGuard({
        admin,
        jobId: SOAK_JOB_ID,
        candidateId,
        organisationId: SOAK_ORG_ID,
      });
      expect(guard).toEqual({
        block: true,
        reason: "gate_failed",
        gateStatus: "failed",
      });

      const { data: gatedScore } = await admin
        .from("fit_scores")
        .select("band, scoring_method, scoring_status, overall_score")
        .eq("job_id", SOAK_JOB_ID)
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(gatedScore?.band).toBe("Gated Out");
      expect(gatedScore?.scoring_method).toBe("prescreen_gate");
      expect(gatedScore?.scoring_status).toBe("deferred");
      expect(gatedScore?.overall_score).toBe(0);

      const llmAttempt = await FitScoreService.computeSingle(admin, SOAK_JOB_ID, candidateId, {
        onUnapprovedJdBase: "queue_pending",
      });
      expect(llmAttempt).toMatchObject({ scoring_status: "prescreen_gate_blocked" });

      const { data: hybridScores } = await admin
        .from("fit_scores")
        .select("id, scoring_method, overall_score")
        .eq("job_id", SOAK_JOB_ID)
        .eq("candidate_id", candidateId)
        .neq("scoring_method", "prescreen_gate");
      expect(hybridScores ?? []).toHaveLength(0);
    });
  },
);
