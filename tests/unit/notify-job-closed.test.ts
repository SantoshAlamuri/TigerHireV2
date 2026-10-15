import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockCreateNotificationBatch = vi.fn();
const mockSendJobClosedCandidateNotice = vi.fn();
const mockSendJobClosedReferrerNotice = vi.fn();
const mockSendTemplateMessage = vi.fn();
const mockSendWhatsAppMessage = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: (...args: unknown[]) => mockCreateNotificationBatch(...args),
}));

vi.mock("@/lib/services/resend", () => ({
  sendJobClosedCandidateNotice: (...args: unknown[]) => mockSendJobClosedCandidateNotice(...args),
  sendJobClosedReferrerNotice: (...args: unknown[]) => mockSendJobClosedReferrerNotice(...args),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplateMessage(...args),
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("notifyJobClosedStakeholders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotificationBatch.mockResolvedValue(true);
    mockSendJobClosedCandidateNotice.mockResolvedValue({ skipped: false });
    mockSendJobClosedReferrerNotice.mockResolvedValue({ skipped: false });
    mockSendTemplateMessage.mockResolvedValue({ success: false, error: "template_not_configured" });
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  });

  it("notifies WhatsApp-first applicants and referrers when a role closes", async () => {
    const supabase = createMockSupabase({
      jobs: createMockQueryBuilder({
        data: {
          id: "job-1",
          title: "QA Engineer",
          organisations: { name: "Acme Ltd" },
        },
      }),
      applications: createMockQueryBuilder({
        data: [
          {
            id: "app-1",
            source: "referral",
            direct_referrer_id: "ref-1",
            parent_referrer_id: null,
            referral_link_id: "link-1",
            candidate_id: "cand-1",
            candidates: {
              user_id: null,
              email: null,
              full_name: "Asha Kumar",
              name: null,
              phone: "+919999999999",
            },
          },
        ],
      }),
      referral_links: createMockQueryBuilder({
        data: [
          {
            referrer_id: "ref-1",
            referrers: {
              user_id: null,
              work_email: null,
              name: "Ravi",
              whatsapp_number: "+918888888888",
            },
          },
        ],
      }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(supabase);

    const { notifyJobClosedStakeholders } = await import("@/lib/jobs/notify-job-closed");
    await notifyJobClosedStakeholders("job-1");

    expect(mockSendTemplateMessage).toHaveBeenCalledWith({
      phoneNumber: "+919999999999",
      templateName: "th_role_closed",
      bodyParams: ["Asha", "QA Engineer", "Acme Ltd"],
    });
    expect(mockSendTemplateMessage).toHaveBeenCalledWith({
      phoneNumber: "+918888888888",
      templateName: "th_referral_role_closed",
      bodyParams: ["Ravi", "QA Engineer", "Acme Ltd"],
    });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("QA Engineer at Acme Ltd is now closed"),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("Your referral remains attached"),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+918888888888",
      expect.stringContaining("Your referral links for this role are no longer active"),
    );
  });
});
