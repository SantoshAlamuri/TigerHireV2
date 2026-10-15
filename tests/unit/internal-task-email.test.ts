import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/resend", () => ({
  sendEmail: vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null }),
  shouldSendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/whatsapp/outbound-policy", () => ({
  canSendWhatsApp: vi.fn().mockResolvedValue({ allowed: false, reason: "no_session" }),
}));

import { sendEmail } from "@/lib/services/resend";
import {
  sendInternalTaskEmailIfNeeded,
  tasksDeepLink,
} from "@/lib/notifications/internal-task-email";

describe("sendInternalTaskEmailIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends pending approval email when WhatsApp is unavailable", async () => {
    const sent = await sendInternalTaskEmailIfNeeded({
      recipient: { email: "hm@company.com", phone: null, name: "Alex" },
      kind: "pending_approval",
      taskId: "ap:pc-1",
      title: "Approval needed",
      bodyLines: ["Please approve this candidate."],
    });
    expect(sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "hm@company.com",
        subject: "Approval needed",
      }),
    );
  });

  it("builds tasks deep link", () => {
    expect(tasksDeepLink("ap:abc")).toContain("/tasks?task=ap%3Aabc");
  });
});
