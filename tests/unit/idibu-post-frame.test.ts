import { describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";
import type { IdibuCredentials } from "@/lib/integrations/idibu/credentials";

vi.mock("@/lib/fitscore/hybrid/jd-base", () => ({
  getJdBaseByJobId: vi.fn().mockResolvedValue({
    approvedBy: "user-1",
    roleTitle: "QA Engineer",
    company: "TigerHire",
    context: "Own quality for releases.",
  }),
}));

const JOB_ID = "00000000-0000-4000-8000-000000000001";

const SAMPLE_CREDS: IdibuCredentials = {
  app_id: "app-1",
  app_secret: "secret-1",
  integration_name: "tigerhire",
  webhook_secret: "wh-sec",
  default_sector: "1",
};

describe("idibu post-frame", () => {
  it("isIdibuPostingConfigured reflects credential completeness", async () => {
    const { isIdibuPostingConfigured } = await import("@/lib/integrations/idibu/post-frame");
    expect(isIdibuPostingConfigured(null)).toBe(false);
    expect(isIdibuPostingConfigured(SAMPLE_CREDS)).toBe(true);
    expect(isIdibuPostingConfigured({ ...SAMPLE_CREDS, integration_name: "" })).toBe(false);
  });

  it("buildIdibuPostFrameFields uses job id as vacancy reference", async () => {
    const mockFrom = vi.fn().mockReturnValue(
      createMockQueryBuilder({
        data: {
          id: JOB_ID,
          title: "QA Engineer",
          description: "Test jobs",
          location: "Bengaluru",
          compensation_min: 800000,
          compensation_max: 1200000,
          skills_required: ["Playwright"],
          role_category: "engineering",
          employment_type: "full_time",
        },
      }),
    );

    const { buildIdibuPostFrameFields } = await import("@/lib/integrations/idibu/post-frame");
    const fields = await buildIdibuPostFrameFields(
      { from: mockFrom } as never,
      {
        jobId: JOB_ID,
        recruiterUserId: "rec-1",
        recruiterEmail: "rec@tigerhire.io",
        recruiterFullName: "Sam Recruiter",
      },
      SAMPLE_CREDS,
    );

    expect(fields.vacancy).toBe(JOB_ID);
    expect(fields.id).toBe("app-1");
    expect(fields.secret).toBe("secret-1");
    expect(fields.sector).toBe("1");
    expect(fields.type).toBe("1");
    expect(fields.minsalary).toBe("800000");
    expect(fields.maxsalary).toBe("1200000");
  });

  it("renderIdibuAutoSubmitHtml posts to integration endpoint with hidden fields", async () => {
    const { idibuIntegrationEndpoint, renderIdibuAutoSubmitHtml } =
      await import("@/lib/integrations/idibu/post-frame");
    const html = renderIdibuAutoSubmitHtml(
      {
        id: "app-1",
        secret: "secret-1",
        vacancy: JOB_ID,
        title: "QA Engineer",
      },
      "tigerhire",
    );
    expect(idibuIntegrationEndpoint("tigerhire")).toBe(
      "https://v3.idibu.com/c/integration/tigerhire",
    );
    expect(html).toContain('method="POST"');
    expect(html).toContain('name="vacancy"');
    expect(html).toContain(JOB_ID);
    expect(html).toContain("document.getElementById");
  });
});
