import { describe, it, expect } from "vitest";
import {
  mapDbJobToPosting,
  mapDbCandidateToView,
  mapDbFitScoreToView,
  mapDbOrgToView,
  mapDbAgentRunToView,
  mapDbApplicationToView,
} from "@/lib/mappers";

describe("mapDbJobToPosting", () => {
  it("maps a full DB row to JobPosting", () => {
    const row = {
      id: "job-1",
      organisation_id: "org-1",
      organisations: { name: "Razorpay" },
      title: "Senior SDE",
      description: "Build stuff",
      location: "Bengaluru",
      remote_allowed: true,
      skills_required: ["TypeScript", "React"],
      skills_preferred: ["Go"],
      compensation_min: 2000000,
      compensation_max: 3500000,
      status: "open",
      urgency_score: 75,
      created_at: "2025-01-15T00:00:00Z",
      updated_at: "2025-01-20T00:00:00Z",
      matched_count: 12,
    };

    const result = mapDbJobToPosting(row);
    expect(result.id).toBe("job-1");
    expect(result.companyName).toBe("Razorpay");
    expect(result.titleRaw).toBe("Senior SDE");
    expect(result.salaryMin).toBe(2000000);
    expect(result.salaryMax).toBe(3500000);
    expect(result.isActive).toBe(true);
    expect(result.skillsRequired).toEqual(["TypeScript", "React"]);
    expect(result.matchedCandidatesCount).toBe(12);
  });

  it("uses defaults for missing fields", () => {
    const result = mapDbJobToPosting({ id: "job-2" });
    expect(result.companyName).toBe("Unknown");
    expect(result.titleRaw).toBe("");
    expect(result.salaryMin).toBe(0);
    expect(result.isActive).toBe(true);
    expect(result.location).toBe("Remote");
  });

  it("marks closed jobs as inactive", () => {
    const result = mapDbJobToPosting({ id: "job-3", status: "closed" });
    expect(result.isActive).toBe(false);
  });
});

describe("mapDbCandidateToView", () => {
  it("maps a full DB row to Candidate", () => {
    const row = {
      id: "c-1",
      name: "Rahul Verma",
      skills: ["React", "Node.js"],
      intent_score: 85,
      location: "Bengaluru, Karnataka",
      experience_years: 6,
      role_title: "Senior Engineer",
      user_id: "user-1",
    };

    const result = mapDbCandidateToView(row);
    expect(result.id).toBe("c-1");
    expect(result.name).toBe("Rahul Verma");
    expect(result.nameMasked).toBe("Rahul V.");
    expect(result.intentLabel).toBe("Active Now");
    expect(result.locationCity).toBe("Bengaluru");
    expect(result.locationState).toBe("Karnataka");
    expect(result.claimed).toBe(true);
    expect(result.yearsExperience).toBe(6);
  });

  it("assigns correct intent labels", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 85 }).intentLabel).toBe("Active Now");
    expect(mapDbCandidateToView({ id: "c", intent_score: 65 }).intentLabel).toBe(
      "Actively Exploring",
    );
    expect(mapDbCandidateToView({ id: "c", intent_score: 45 }).intentLabel).toBe("Passively Open");
    expect(mapDbCandidateToView({ id: "c", intent_score: 25 }).intentLabel).toBe("Lightly Passive");
    expect(mapDbCandidateToView({ id: "c", intent_score: 10 }).intentLabel).toBe("Unknown");
  });

  it("handles missing location gracefully", () => {
    const result = mapDbCandidateToView({ id: "c-2" });
    expect(result.locationCity).toBe("");
  });
});

describe("mapDbFitScoreToView", () => {
  it("maps a DB row to FitScore", () => {
    const row = {
      id: "fs-1",
      candidate_id: "c-1",
      job_id: "j-1",
      overall_score: 82,
      candidates: { name: "Rahul" },
      jobs: { title: "SDE-2" },
      green_flags: ["Strong skills"],
      amber_flags: ["Location mismatch"],
      red_flags: [],
      summary: "Good fit overall",
      dimensions: {
        skillsMatch: { score: 90, weight: 30, label: "Skills Match" },
      },
    };

    const result = mapDbFitScoreToView(row);
    expect(result.id).toBe("fs-1");
    expect(result.overallScore).toBe(82);
    expect(result.rating).toBe("Good Match"); // 82 is in 75–89 band
    expect(result.dimensions.skillsMatch.score).toBe(90);
    expect(result.greenFlags).toEqual(["Strong skills"]);
    expect(result.aiSummary).toBe("Good fit overall");
    expect(result.scoringVersion).toBe(1);
  });

  it("maps scoring_version 2 for hybrid rows", () => {
    const row = {
      id: "fs-h2",
      candidate_id: "c-1",
      job_id: "j-1",
      overall_score: 70,
      scoring_version: 2,
      candidates: { name: "Alex" },
      jobs: { title: "SM" },
      green_flags: [],
      amber_flags: [],
      red_flags: [],
      dimensions: { skillsMatch: { score: 70, weight: 30, label: "Skills" } },
    };
    const result = mapDbFitScoreToView(row);
    expect(result.scoringVersion).toBe(2);
  });

  it("maps ideal_gaps from hybrid rows", () => {
    const row = {
      id: "fs-hybrid-gaps",
      candidate_id: "c-1",
      job_id: "j-1",
      overall_score: 68,
      scoring_version: 2,
      candidates: { name: "Alex" },
      jobs: { title: "Backend Engineer" },
      ideal_gaps: ["No Kubernetes production ownership", "Limited incident response depth"],
    };

    const result = mapDbFitScoreToView(row);
    expect(result.idealGaps).toEqual([
      "No Kubernetes production ownership",
      "Limited incident response depth",
    ]);
  });

  it("maps hybrid v2_score_breakdown.dimensions to distinct dimension bars (not legacy V1 fallbacks)", () => {
    const row = {
      id: "fs-hybrid-v2",
      candidate_id: "c-1",
      job_id: "j-1",
      overall_score: 68,
      scoring_version: 2,
      candidates: { name: "Alex" },
      jobs: { title: "QA Engineer" },
      v2_score_breakdown: {
        dimensions: {
          test_automation: { value: 8, weight: 25, contribution: 20 },
          api_testing: { value: 6, weight: 20, contribution: 12 },
        },
        formulaLines: [],
      },
    };
    const result = mapDbFitScoreToView(row);
    expect(result.dimensions.test_automation.score).toBe(80);
    expect(result.dimensions.test_automation.weight).toBeCloseTo(0.25);
    expect(result.dimensions.api_testing.score).toBe(60);
    expect(result.dimensions.api_testing.weight).toBeCloseTo(0.2);
    expect(result.dimensions.skillsMatch).toBeUndefined();
  });

  it("falls back to nested jobs.organisations.name for companyName (candidate matches shape)", () => {
    const result = mapDbFitScoreToView({
      id: "fs-nested",
      jobs: { title: "SDE-2", organisations: { name: "Acme Corp" } },
    });
    expect(result.companyName).toBe("Acme Corp");
    expect(result.jobTitle).toBe("SDE-2");
  });

  it("prefers flat company_name over the nested organisation name", () => {
    const result = mapDbFitScoreToView({
      id: "fs-flat",
      company_name: "Flat Co",
      jobs: { organisations: { name: "Nested Co" } },
    });
    expect(result.companyName).toBe("Flat Co");
  });

  it("companyName defaults to empty string when no source is present", () => {
    const result = mapDbFitScoreToView({ id: "fs-none", jobs: { title: "SDE-2" } });
    expect(result.companyName).toBe("");
  });

  it("defaults to 0 for missing overall_score", () => {
    const result = mapDbFitScoreToView({ id: "fs-2" });
    expect(result.overallScore).toBe(0);
    expect(result.rating).toBe("Weak"); // 0 is below 60
  });
});

describe("mapDbOrgToView", () => {
  it("maps an organisation row", () => {
    const row = {
      id: "org-1",
      name: "Razorpay",
      company_plan: "growth",
      seats_used: 3,
      seats_total: 5,
      unlocks_used: 10,
    };

    const result = mapDbOrgToView(row);
    expect(result.name).toBe("Razorpay");
    expect(result.billingTier).toBe("growth");
    expect(result.unlockQuotaMonthly).toBe(50);
    expect(result.seatsUsed).toBe(3);
    expect(result.seatsTotal).toBe(5);
  });

  it("defaults to free tier", () => {
    const result = mapDbOrgToView({ id: "org-2" });
    expect(result.billingTier).toBe("free");
    expect(result.unlockQuotaMonthly).toBe(5);
  });
});

describe("mapDbAgentRunToView", () => {
  it("maps an agent log row", () => {
    const row = {
      id: "al-1",
      agent_name: "fitscore",
      started_at: "2025-01-15T10:00:00Z",
      completed_at: "2025-01-15T10:05:00Z",
      records_processed: 100,
      records_created: 50,
      records_updated: 25,
      errors_count: 2,
      cost_usd: 0.5,
      status: "completed",
    };

    const result = mapDbAgentRunToView(row);
    expect(result.agentType).toBe("fitscore");
    expect(result.recordsProcessed).toBe(100);
    expect(result.status).toBe("completed");
    expect(result.costUsd).toBe(0.5);
  });
});

describe("mapDbApplicationToView", () => {
  it("maps an application row", () => {
    const row = {
      id: "app-1",
      candidate_id: "c-1",
      job_id: "j-1",
      status: "shortlisted",
      interest: "strong_interest",
      cover_note: "Very interested",
      jobs: { title: "SDE-2", organisations: { name: "Razorpay" } },
      candidates: { name: "Rahul Verma" },
      fit_scores: { overall_score: 85 },
      created_at: "2025-01-20T00:00:00Z",
      updated_at: "2025-01-21T00:00:00Z",
    };

    const result = mapDbApplicationToView(row);
    expect(result.id).toBe("app-1");
    expect(result.status).toBe("shortlisted");
    expect(result.interest).toBe("strong_interest");
    expect(result.jobTitle).toBe("SDE-2");
    expect(result.companyName).toBe("Razorpay");
    expect(result.candidateName).toBe("Rahul Verma");
    expect(result.candidateNameMasked).toBe("Rahul V.");
    expect(result.overallScore).toBe(85);
    expect(result.appliedViaReferral).toBe(false);
  });

  it("defaults to 'applied' status and 'interested' interest", () => {
    const result = mapDbApplicationToView({ id: "app-2" });
    expect(result.status).toBe("applied");
    expect(result.interest).toBe("interested");
    expect(result.appliedViaReferral).toBe(false);
  });

  it("defaults overallScore to null when fit_scores is absent", () => {
    const result = mapDbApplicationToView({ id: "app-3" });
    expect(result.overallScore).toBeNull();
    expect(result.appliedViaReferral).toBe(false);
  });

  it("sets appliedViaReferral when direct_referrer_id or referral_link_id is present", () => {
    expect(
      mapDbApplicationToView({ id: "a", direct_referrer_id: "ref-1" }).appliedViaReferral,
    ).toBe(true);
    expect(mapDbApplicationToView({ id: "b", referral_link_id: "rl-1" }).appliedViaReferral).toBe(
      true,
    );
  });

  it("sets fitScoreId from row data", () => {
    const result = mapDbApplicationToView({
      id: "app-4",
      fit_score_id: "fs-99",
    });
    expect(result.fitScoreId).toBe("fs-99");
  });
});

describe("mapDbJobToPosting – JD sections", () => {
  it("parses jd_sections when present", () => {
    const row = {
      id: "job-jd",
      jd_sections: {
        designation: "SDE-2",
        technicalSkills: ["React", "Node.js"],
        benefits: ["WFH", "Health insurance"],
      },
    };
    const result = mapDbJobToPosting(row);
    expect(result.jdSections).toBeDefined();
    expect(result.jdSections!.designation).toBe("SDE-2");
    expect(result.jdSections!.technicalSkills).toEqual(["React", "Node.js"]);
  });

  it("sets jdSections to undefined when sections are all empty", () => {
    const result = mapDbJobToPosting({ id: "job-empty-jd", jd_sections: {} });
    expect(result.jdSections).toBeUndefined();
  });

  it("falls back to organisation_name when organisations.name missing", () => {
    const result = mapDbJobToPosting({
      id: "job-orgname",
      organisation_name: "FallbackCo",
    });
    expect(result.companyName).toBe("FallbackCo");
  });
});

describe("mapDbCandidateToView – edge cases", () => {
  it("sets claimed to false when user_id is null", () => {
    const result = mapDbCandidateToView({
      id: "c-no-user",
      user_id: null,
    });
    expect(result.claimed).toBe(false);
  });

  it("uses name_masked from DB when provided", () => {
    const result = mapDbCandidateToView({
      id: "c-masked",
      name: "Priya Sharma",
      name_masked: "Priya S.",
    });
    expect(result.nameMasked).toBe("Priya S.");
  });

  it("handles single-word name for masking", () => {
    const result = mapDbCandidateToView({
      id: "c-single",
      name: "Priya",
    });
    expect(result.nameMasked).toBe("Priya");
  });

  it("intent boundary at exactly 80", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 80 }).intentLabel).toBe("Active Now");
  });

  it("intent boundary at exactly 60", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 60 }).intentLabel).toBe(
      "Actively Exploring",
    );
  });

  it("intent boundary at exactly 40", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 40 }).intentLabel).toBe("Passively Open");
  });

  it("intent boundary at exactly 20", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 20 }).intentLabel).toBe("Lightly Passive");
  });

  it("intent score 0 is Unknown", () => {
    expect(mapDbCandidateToView({ id: "c", intent_score: 0 }).intentLabel).toBe("Unknown");
  });
});

describe("mapDbFitScoreToView – edge cases", () => {
  it("fills dimension defaults when dimensions missing", () => {
    const result = mapDbFitScoreToView({ id: "fs-empty" });
    expect(result.dimensions.skillsMatch.weight).toBe(0);
    expect(result.dimensions.experienceRelevance.label).toBe("experienceRelevance");
  });

  it("reads candidate name from nested candidates object", () => {
    const result = mapDbFitScoreToView({
      id: "fs-nested",
      candidates: { name: "Nested Name" },
    });
    expect(result.candidateName).toBe("Nested Name");
  });

  it("reads job title from nested jobs object", () => {
    const result = mapDbFitScoreToView({
      id: "fs-j",
      jobs: { title: "Lead Engineer" },
    });
    expect(result.jobTitle).toBe("Lead Engineer");
  });
});

describe("mapDbOrgToView – plan tiers", () => {
  it("maps starter plan", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "starter" });
    expect(result.billingTier).toBe("starter");
    expect(result.unlockQuotaMonthly).toBe(15);
  });

  it("maps scale plan", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "scale" });
    expect(result.billingTier).toBe("scale");
    expect(result.unlockQuotaMonthly).toBe(500);
  });

  it("defaults seats for scale plan", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "scale" });
    expect(result.seatsTotal).toBe(15);
  });

  it("defaults seats for growth plan", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "growth" });
    expect(result.seatsTotal).toBe(5);
  });

  it("defaults seats for starter plan", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "starter" });
    expect(result.seatsTotal).toBe(2);
  });

  it("treats unknown plan as free", () => {
    const result = mapDbOrgToView({ id: "o", company_plan: "enterprise" });
    expect(result.billingTier).toBe("free");
    expect(result.unlockQuotaMonthly).toBe(5);
  });
});

describe("mapDbAgentRunToView – fallbacks", () => {
  it("falls back to payload fields", () => {
    const result = mapDbAgentRunToView({
      id: "al-2",
      payload: {
        completed_at: "2025-01-15T11:00:00Z",
        records_processed: 5,
        records_created: 3,
        records_updated: 1,
        errors_count: 0,
        cost_usd: 0.1,
      },
    });
    expect(result.completedAt).toBe("2025-01-15T11:00:00Z");
    expect(result.recordsProcessed).toBe(5);
    expect(result.costUsd).toBe(0.1);
  });

  it("defaults all fields when row is minimal", () => {
    const result = mapDbAgentRunToView({ id: "al-min" });
    expect(result.agentType).toBe("talent_scout");
    expect(result.status).toBe("completed");
    expect(result.recordsProcessed).toBe(0);
    expect(result.errorsCount).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.completedAt).toBeNull();
  });

  it("falls back to created_at when started_at missing", () => {
    const result = mapDbAgentRunToView({
      id: "al-ca",
      created_at: "2025-06-01T00:00:00Z",
    });
    expect(result.startedAt).toBe("2025-06-01T00:00:00Z");
  });
});

describe("mapDbFitScoreToView – hybrid correctness fixes", () => {
  const base = {
    id: "fs-fx",
    candidate_id: "c-1",
    job_id: "j-1",
    candidates: { name: "Alex" },
    jobs: { title: "SDE" },
    amber_flags: [],
    red_flags: [],
  };

  it("filters NO_DEFENSIBLE_QUOTE sentinel quotes out of verdictEvidenceQuotes", () => {
    const row = {
      ...base,
      overall_score: 70,
      scoring_version: 2,
      green_flags: [],
      evidence_json: {
        quotes: [
          { dimension: "technical_depth", quote: "Led migration to Kubernetes" },
          {
            dimension: "leadership",
            quote: "NO_DEFENSIBLE_QUOTE",
            location_hint: "No leadership evidence in CV",
          },
          {
            dimension: "domain",
            quote: "No quote entry returned by model",
          },
        ],
      },
    };
    const result = mapDbFitScoreToView(row);
    expect(result.verdictEvidenceQuotes).toHaveLength(1);
    expect(result.verdictEvidenceQuotes?.[0].quote).toBe("Led migration to Kubernetes");
    // Derived evidence snapshot must not contain the sentinel either
    const snapshotValues = Object.values(result.evidenceSnapshot ?? {}).join("\n");
    expect(snapshotValues).not.toContain("NO_DEFENSIBLE_QUOTE");
  });

  it("sets extractionFallback when scoring_method is deterministic_fallback", () => {
    const row = {
      ...base,
      overall_score: 55,
      scoring_version: 2,
      green_flags: [],
      scoring_method: "deterministic_fallback",
    };
    const result = mapDbFitScoreToView(row);
    expect(result.extractionFallback).toBe(true);
  });

  it("leaves extractionFallback from the column for normal hybrid saves", () => {
    const row = {
      ...base,
      overall_score: 70,
      scoring_version: 2,
      green_flags: [],
      scoring_method: "hybrid_merged",
    };
    const result = mapDbFitScoreToView(row);
    expect(result.extractionFallback).toBeNull();
  });

  it("humanizes machine-token green flags from deterministic fallback", () => {
    const row = {
      ...base,
      overall_score: 55,
      scoring_version: 2,
      scoring_method: "deterministic_fallback",
      green_flags: [
        "skill_match:technical_depth",
        "skill_match:react",
        "Strong ownership shown across releases",
      ],
    };
    const result = mapDbFitScoreToView(row);
    expect(result.greenFlags).toEqual([
      "Matched: Technical Depth",
      "Matched: React",
      "Strong ownership shown across releases",
    ]);
  });

  it("does not mangle sentences containing colons", () => {
    const row = {
      ...base,
      overall_score: 70,
      scoring_version: 2,
      green_flags: ["Strong Python: 5 years shipping data pipelines"],
    };
    const result = mapDbFitScoreToView(row);
    expect(result.greenFlags).toEqual(["Strong Python: 5 years shipping data pipelines"]);
  });

  it("headline honors persisted overall_score over raw primary_score (blend selection)", () => {
    // select-blend wrote overall_score := shadow (61); primary is 82 — headline must be 61
    const row = {
      ...base,
      overall_score: 61,
      primary_score: 82,
      shadow_score: 61,
      recruiter_selected: "shadow",
      scoring_version: 2,
      green_flags: [],
    };
    const result = mapDbFitScoreToView(row);
    expect(result.overallScore).toBe(61);
    expect(result.primaryScore).toBe(82);
  });

  it("still falls back to primary_score when overall_score is missing or zero on v2 rows", () => {
    const row = {
      ...base,
      overall_score: 0,
      primary_score: 82,
      scoring_version: 2,
      green_flags: [],
    };
    const result = mapDbFitScoreToView(row);
    expect(result.overallScore).toBe(82);
  });
});
