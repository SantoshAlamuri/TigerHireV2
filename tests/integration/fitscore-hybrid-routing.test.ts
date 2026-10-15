import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(async (params: { system?: string }) => {
        const system = String(params.system ?? "");

        if (system.includes("resume fact extractor")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  skills: ["Design Systems", "Figma", "React"],
                  named_tools: ["Figma", "Storybook", "React"],
                  named_deliverables: ["Component library revamp"],
                  metrics: ["35% faster design to dev handoff"],
                  years_per_company: [
                    { company: "Tiger Design Co", role: "Design Systems Designer", years: 3 },
                  ],
                  total_years: 6,
                  current_role: "Design Systems Designer",
                  career_trajectory: "ascending",
                  professional_identity: "Asha Rao, Design Systems Designer",
                }),
              },
            ],
            usage: { input_tokens: 120, output_tokens: 80 },
          };
        }

        if (
          system.includes(
            "expert technical recruiter evaluating candidates against role-specific dimensions",
          )
        ) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  candidate_name: "Asha Rao",
                  total_years: 6,
                  dimension_scores: {
                    design_system_ownership: 9,
                    systems_thinking: 8,
                    cross_functional_leadership: 8,
                    technical_depth: 7,
                    documentation_evangelization: 8,
                  },
                  certifications: ["DesignOps Foundation"],
                  quantified_impact: ["35% faster handoff"],
                  red_flags: [],
                  green_flags: ["Built cross-product component governance"],
                  role_match_tag: "Design Systems Specialist",
                  summary: "Strong design systems practitioner with measurable impact.",
                }),
              },
            ],
            usage: { input_tokens: 160, output_tokens: 110 },
          };
        }

        if (
          system.includes("concise recruiter verdict explanations") ||
          system.includes("concise recruiter explanations")
        ) {
          return {
            content: [
              {
                type: "text",
                text: "Score reflects strong systems ownership. Candidate shows concrete impact with tooling depth. Probe edge-case architecture tradeoffs in interview.",
              },
            ],
            usage: { input_tokens: 90, output_tokens: 45 },
          };
        }

        return {
          content: [{ type: "text", text: "{}" }],
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      }),
    };
  },
}));

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const isCI = process.env.CI === "true";
const requireLiveDbInCi = process.env.REQUIRE_LIVE_SUPABASE_INTEGRATION === "true";

if (isCI && requireLiveDbInCi && !hasLiveSupabaseEnv) {
  throw new Error(
    "tests/integration/fitscore-hybrid-routing.test.ts requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in CI. This test must execute against a real test database (not skip).",
  );
}

describe.skipIf(!hasLiveSupabaseEnv)(
  "FitScoreService hybrid routing (integration-tier, live DB)",
  () => {
    let admin: ReturnType<typeof createSupabaseAdmin>;
    let orgId: string;
    let creatorUserId: string;
    let candidateId: string;
    let hybridJobId: string;
    let threeStageJobId: string;
    const touchedFlagKeys = [
      "scoring_phase1_wiring",
      "scoring_v2_shadow_enabled",
      "scoring_v2_primary",
    ] as const;
    const previousFlagState = new Map<
      string,
      { existed: boolean; enabled: boolean; description: string | null }
    >();

    beforeAll(async () => {
      admin = createSupabaseAdmin();
      const suffix = Date.now().toString(36);

      const { data: existingFlags } = await admin
        .from("feature_flags")
        .select("key, enabled, description")
        .in("key", [...touchedFlagKeys]);

      for (const key of touchedFlagKeys) {
        const row = (existingFlags ?? []).find((item) => item.key === key);
        previousFlagState.set(key, {
          existed: Boolean(row),
          enabled: row?.enabled ?? false,
          description: row?.description ?? null,
        });
      }

      await admin.from("feature_flags").upsert(
        [
          {
            key: "scoring_phase1_wiring",
            enabled: true,
            description: "Integration test override",
          },
          {
            key: "scoring_v2_shadow_enabled",
            enabled: false,
            description: "Integration test override",
          },
          {
            key: "scoring_v2_primary",
            enabled: false,
            description: "Integration test override",
          },
        ],
        { onConflict: "key" },
      );

      const { data: org } = await admin
        .from("organisations")
        .insert({
          name: `FitScore Hybrid Routing Test Org ${suffix}`,
          type: "company",
          slug: `fitscore-hybrid-routing-${suffix}`,
        })
        .select("id")
        .single();
      orgId = org!.id;

      const { data: creatorUser } = await admin.auth.admin.createUser({
        email: `fitscore-routing-${suffix}@example.com`,
        password: "Test123!@#",
        email_confirm: true,
      });
      if (!creatorUser.user) {
        throw new Error("Failed to create integration test auth user");
      }
      creatorUserId = creatorUser.user.id;

      await admin.from("profiles").insert({
        id: creatorUserId,
        organisation_id: orgId,
        role: "leadership",
        full_name: "FitScore Routing Admin",
      });

      const { data: candidate } = await admin
        .from("candidates")
        .insert({
          name: "Asha Rao",
          email: `asha-${suffix}@example.com`,
          phone: `+91987${suffix.slice(-6).padStart(6, "0")}`,
          skills: ["Design Systems", "Figma", "Storybook", "React"],
          experience_years: 6,
          location: "Bangalore",
          intent_score: 90,
          current_role: "Design Systems Designer",
          current_company: "Tiger Design Co",
          cv_raw_text:
            "Built and maintained a company-wide component library using Storybook and React. Led design-token governance and improved design to engineering handoff by 35%. Collaborated with product and frontend teams across multiple squads.",
        })
        .select("id")
        .single();
      candidateId = candidate!.id;

      const { data: hybridJob } = await admin
        .from("jobs")
        .insert({
          organisation_id: orgId,
          created_by: creatorUserId,
          title: "Design Systems Designer (Hybrid Route)",
          description:
            "Own design system architecture, component library quality, and cross-functional governance.",
          location: "Bangalore",
          role_function: "Design",
          status: "open",
          skills_required: ["Design systems", "Storybook", "React"],
        })
        .select("id")
        .single();
      hybridJobId = hybridJob!.id;

      const { data: threeStageJob } = await admin
        .from("jobs")
        .insert({
          organisation_id: orgId,
          created_by: creatorUserId,
          title: "Design Systems Designer (Three Stage Route)",
          description:
            "Looking for a design systems owner with component library, design ops, and system thinking depth.",
          location: "Remote",
          role_function: "Design",
          status: "open",
          skills_required: ["Design systems", "Design ops", "Component libraries"],
        })
        .select("id")
        .single();
      threeStageJobId = threeStageJob!.id;

      await admin.from("jd_base_documents").insert({
        job_id: hybridJobId,
        role_title: "Design Systems Designer",
        company: "TigerHire Client",
        context: "Hiring for a role that owns design system quality and adoption.",
        weights: {
          design_system_ownership: 30,
          systems_thinking: 25,
          cross_functional_leadership: 20,
          technical_depth: 15,
          documentation_evangelization: 10,
        },
        score_floor: 15,
        fit_thresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
        approved_by: creatorUserId,
        approved_at: new Date().toISOString(),
      });
    });

    afterAll(async () => {
      if (!admin) return;

      await admin.from("fit_scores_v2").delete().eq("candidate_id", candidateId);
      await admin.from("fit_scores").delete().eq("candidate_id", candidateId);
      await admin.from("fit_score_evidence").delete().eq("candidate_id", candidateId);
      await admin.from("fit_score_rubrics").delete().in("job_id", [hybridJobId, threeStageJobId]);
      await admin.from("jd_base_documents").delete().eq("job_id", hybridJobId);
      await admin.from("jobs").delete().in("id", [hybridJobId, threeStageJobId]);
      await admin.from("candidates").delete().eq("id", candidateId);
      await admin.from("profiles").delete().eq("id", creatorUserId);
      await admin.auth.admin.deleteUser(creatorUserId);
      await admin.from("organisations").delete().eq("id", orgId);

      for (const key of touchedFlagKeys) {
        const previous = previousFlagState.get(key);
        if (!previous?.existed) {
          await admin.from("feature_flags").delete().eq("key", key);
        } else {
          await admin.from("feature_flags").upsert(
            {
              key,
              enabled: previous.enabled,
              description: previous.description ?? `Restored by integration test`,
            },
            { onConflict: "key" },
          );
        }
      }
    });

    it("executes hybrid pipeline for approved JD base and writes v2 scoring fields", async () => {
      const { FitScoreService } = await import("@/lib/services/FitScoreService");

      const result = await FitScoreService.computeSingle(admin, hybridJobId, candidateId, {
        isTestRun: true,
      });

      expect(result).toHaveProperty("fitScore");

      const { data: scoreRow, error } = await admin
        .from("fit_scores")
        .select("scoring_version, v2_extraction, v2_score_breakdown, overall_score")
        .eq("job_id", hybridJobId)
        .eq("candidate_id", candidateId)
        .eq("is_test_run", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(error).toBeNull();
      expect(scoreRow).toBeTruthy();
      // In this codebase, scoring_version=2 denotes the approved-JD hybrid pipeline persisted by saveHybridFitScore.
      // This is separate from the new fit_scores_v2 shadow table path.
      expect(scoreRow!.scoring_version).toBe(2);
      expect(scoreRow!.v2_extraction).toBeTruthy();
      expect(scoreRow!.v2_score_breakdown).toBeTruthy();
      expect(typeof scoreRow!.overall_score).toBe("number");
    });

    it("queues pending_jd_approval when JD base is not approved (no v1 fallback scoring)", async () => {
      const { FitScoreService } = await import("@/lib/services/FitScoreService");

      const result = await FitScoreService.computeSingle(admin, threeStageJobId, candidateId, {
        isTestRun: true,
        onUnapprovedJdBase: "queue_pending",
      });

      expect(result).toMatchObject({
        scoring_status: "pending_jd_approval",
        job_id: threeStageJobId,
        candidate_id: candidateId,
      });

      const { data: scoreRow, error: scoreErr } = await admin
        .from("fit_scores")
        .select("id")
        .eq("job_id", threeStageJobId)
        .eq("candidate_id", candidateId)
        .eq("is_test_run", true)
        .maybeSingle();

      expect(scoreErr).toBeNull();
      expect(scoreRow).toBeNull();
    });
  },
);
