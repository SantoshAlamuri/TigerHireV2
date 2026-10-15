import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallClaude = vi.fn();

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonObject: (text: string) => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON");
    return JSON.parse(text.slice(start, end + 1));
  },
}));

const mockJobUpdate = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "00000000-0000-4000-8000-000000000099",
                  title: "Frontend Engineer",
                  description: "Build React apps",
                  jd_sections: [],
                  organisation_id: "org-1",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: mockJobUpdate,
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  }),
}));

describe("Agent smoke (mocked LLM)", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockJobUpdate.mockClear();
  });

  it("parseCVWithClaude returns schema-valid output", async () => {
    mockCallClaude.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 50 },
      text: JSON.stringify({
        full_name: "Jane Doe",
        email: "jane@example.com",
        phone: "9876543210",
        canonical_skills: ["TypeScript", "React"],
        seniority_level: "senior",
        years_experience: 6,
        current_title: "Engineer",
        availability: "immediate",
        authenticity_flags: [],
      }),
    });

    const { parseCVWithClaude } = await import("@/lib/agents/cv-parser");
    const result = await parseCVWithClaude(
      "Jane Doe\nEngineer\nTypeScript React\njane@example.com\n6 years experience",
    );

    expect(result.parsed.full_name).toBe("Jane Doe");
    expect(result.parsed.canonical_skills).toContain("typescript");
  });

  it("runJdIntelligence returns rubric JSON shape", async () => {
    mockCallClaude.mockResolvedValue({
      usage: { input_tokens: 200, output_tokens: 100 },
      text: JSON.stringify({
        mustHaves: [{ skill: "React", weight: 8, description: "Core UI" }],
        niceToHaves: [{ skill: "GraphQL", weight: 4, description: "Bonus" }],
        scoringCriteria: [
          { dimensionName: "Skills", weight: 60, description: "Technical fit" },
          { dimensionName: "Experience", weight: 40, description: "Years" },
        ],
        idealCandidateProfile: "Senior frontend engineer",
        redFlagIndicators: ["No production experience"],
      }),
    });

    const { runJdIntelligence } = await import("@/lib/agents/jd-intelligence");
    const result = await runJdIntelligence("00000000-0000-4000-8000-000000000099");

    expect(result.rubric.mustHaves.length).toBeGreaterThan(0);
    expect(result.rubric.scoringCriteria.length).toBeGreaterThan(0);
    expect(mockJobUpdate).toHaveBeenCalled();
  });
});
