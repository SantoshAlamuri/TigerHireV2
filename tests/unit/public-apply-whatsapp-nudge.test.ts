/** Node env: importing public-apply must not load browser-guarded SDKs via fitscore side effects. */
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const sendApplicationReceivedTemplate = vi.fn();
const sendWhatsAppMessage = vi.fn();

vi.mock("@/lib/services/whatsapp", () => ({
  sendApplicationReceivedTemplate: (...args: unknown[]) => sendApplicationReceivedTemplate(...args),
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("sendPostApplyCandidatePortalNudge", () => {
  beforeEach(() => {
    sendApplicationReceivedTemplate.mockReset();
    sendWhatsAppMessage.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses session message (not th_application_received) when no job is targeted (org-wide apply)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const { sendPostApplyCandidatePortalNudge } = await import("@/lib/agents/public-apply");
    const supabase = createMockSupabase();

    await sendPostApplyCandidatePortalNudge(
      supabase as any,
      { phone: "+919999999999", jobId: undefined, whatsappOptIn: true },
      "cand-1",
      "Asha",
    );

    expect(sendApplicationReceivedTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      "Thanks for applying! Track your application and refer others to earn: https://app.example.com/login",
    );
  }, 60_000);

  it("falls back to session message when jobId is set but application or job row is missing (no template context)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    const { sendPostApplyCandidatePortalNudge } = await import("@/lib/agents/public-apply");
    const supabase = createMockSupabase({
      applications: createMockQueryBuilder({ data: null }),
      jobs: createMockQueryBuilder({
        data: { title: "PM", organisations: { name: "Co" } },
      }),
    });

    await sendPostApplyCandidatePortalNudge(
      supabase as any,
      { phone: "919888888888", jobId: "job-1", whatsappOptIn: true },
      "cand-1",
      "Asha",
    );

    expect(sendApplicationReceivedTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "919888888888",
      "Thanks for applying! Track your application and refer others to earn: https://tigerhire.io/login",
    );
  }, 60_000);

  it("sends th_application_received when job + application rows exist", async () => {
    const { sendPostApplyCandidatePortalNudge } = await import("@/lib/agents/public-apply");
    const supabase = createMockSupabase({
      applications: createMockQueryBuilder({ data: { id: "app-1" } }),
      jobs: createMockQueryBuilder({
        data: { title: "Engineer", organisations: { name: "Acme Ltd" } },
      }),
    });

    await sendPostApplyCandidatePortalNudge(
      supabase as any,
      { phone: "+10000000000", jobId: "job-99", whatsappOptIn: true },
      "cand-x",
      "Ravi",
    );

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(sendApplicationReceivedTemplate).toHaveBeenCalledWith({
      phone: "+10000000000",
      candidateName: "Ravi",
      jobTitle: "Engineer",
      companyName: "Acme Ltd",
      applicationId: "app-1",
    });
  }, 60_000);
});
