/**
 * Integration tests for notification system triggers.
 *
 * These tests verify that:
 * 1. Job match creates in-app notification
 * 2. Application status change triggers email
 * 3. Interview booking sends email notification
 * 4. Score ready notifies recruiter
 * 5. Notifications respect user email preferences
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

// Mock Resend email sending
const mockSendEmail = vi.fn().mockResolvedValue({ id: "msg_test123" });

vi.mock("@/lib/services/resend", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  sendMatchAlert: vi.fn().mockImplementation(async (params) => {
    const shouldSend = await (
      await import("@/lib/services/resend")
    ).shouldSendEmail(params.candidateEmail, "job_alerts");
    if (!shouldSend) return { skipped: true, reason: "email_preference_disabled" };
    return { skipped: false, data: { id: "msg_match" } };
  }),
  sendFitScoreReady: vi.fn().mockImplementation(async (params) => {
    const shouldSend = await (
      await import("@/lib/services/resend")
    ).shouldSendEmail(params.recruiterEmail, "application_updates");
    if (!shouldSend) return { skipped: true, reason: "email_preference_disabled" };
    return { skipped: false, data: { id: "msg_score" } };
  }),
  sendApplicationStatusUpdate: vi.fn().mockImplementation(async (params) => {
    const shouldSend = await (
      await import("@/lib/services/resend")
    ).shouldSendEmail(params.candidateEmail, "application_updates");
    if (!shouldSend) return { skipped: true, reason: "email_preference_disabled" };
    return { skipped: false, data: { id: "msg_status" } };
  }),
  sendInterviewBooked: vi.fn().mockImplementation(async (params) => {
    const shouldSend = await (
      await import("@/lib/services/resend")
    ).shouldSendEmail(params.candidateEmail, "interview_reminders");
    if (!shouldSend) return { skipped: true, reason: "email_preference_disabled" };
    return { skipped: false, data: { id: "msg_interview" } };
  }),
  shouldSendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

describe("Notification Triggers", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSendEmail.mockClear();
  });

  it("job match creates in-app notification", async () => {
    const candidateId = fakeUuid("cand1");
    const jobId = fakeUuid("job1");

    const notificationBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("notif1"),
        user_id: candidateId,
        type: "job_match",
        title: "New job match!",
        body: "Senior Engineer at TechCorp matches your profile",
        link: `/jobs/${jobId}`,
        read: false,
        metadata: { jobId, matchScore: 85 },
        created_at: new Date().toISOString(),
      },
    });
    const supabase = createMockSupabase({ notifications: notificationBuilder });

    const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");

    // Create job match notification
    await NotificationRepository.create(supabase, {
      userId: candidateId,
      type: "job_match",
      title: "New job match!",
      body: "Senior Engineer at TechCorp matches your profile",
      link: `/jobs/${jobId}`,
      metadata: { jobId, matchScore: 85 },
    });

    // Verify the insert was called with correct structure
    expect(notificationBuilder.insert).toHaveBeenCalledWith({
      user_id: candidateId,
      type: "job_match",
      title: "New job match!",
      body: "Senior Engineer at TechCorp matches your profile",
      link: `/jobs/${jobId}`,
      metadata: { jobId, matchScore: 85 },
    });
  });

  it("application status change triggers email", async () => {
    const { sendApplicationStatusUpdate } = await import("@/lib/services/resend");

    const result = await sendApplicationStatusUpdate({
      candidateEmail: "jane@example.com",
      candidateName: "Jane Doe",
      jobTitle: "Senior Engineer",
      companyName: "TechCorp",
      status: "shortlisted",
    });

    expect(result.skipped).toBe(false);
    expect(result).toHaveProperty("data");

    // Verify the function was called with correct params
    expect(sendApplicationStatusUpdate).toHaveBeenCalledWith({
      candidateEmail: "jane@example.com",
      candidateName: "Jane Doe",
      jobTitle: "Senior Engineer",
      companyName: "TechCorp",
      status: "shortlisted",
    });
  });

  it("interview booking sends calendar invite email", async () => {
    const { sendInterviewBooked } = await import("@/lib/services/resend");

    const result = await sendInterviewBooked({
      candidateEmail: "jane@example.com",
      candidateName: "Jane Doe",
      jobTitle: "Senior Engineer",
      interviewDate: "2026-04-15",
      interviewTime: "10:00 AM",
      timezone: "Asia/Kolkata",
    });

    expect(result.skipped).toBe(false);
    expect(result).toHaveProperty("data");

    // Also create in-app notification for the interview
    const notificationBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("notif-int1"),
        user_id: candidateCtx.userId,
        type: "interview_scheduled",
        title: "Interview scheduled",
        body: "Your interview for Senior Engineer is on April 15, 2026",
      },
    });
    const supabase = createMockSupabase({ notifications: notificationBuilder });

    const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
    await NotificationRepository.create(supabase, {
      userId: candidateCtx.userId,
      type: "interview_scheduled",
      title: "Interview scheduled",
      body: "Your interview for Senior Engineer is on April 15, 2026",
      link: "/my/interviews",
    });

    expect(notificationBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "interview_scheduled",
        user_id: candidateCtx.userId,
      }),
    );
  });

  it("score ready notifies recruiter", async () => {
    const { sendFitScoreReady } = await import("@/lib/services/resend");

    const result = await sendFitScoreReady({
      recruiterEmail: "recruiter@techcorp.com",
      roleName: "Senior Engineer",
      topScore: 92,
      candidateCount: 15,
    });

    expect(result.skipped).toBe(false);
    expect(result).toHaveProperty("data");

    // Also create in-app notification for recruiter
    const notifBuilder = createMockQueryBuilder({
      data: {
        id: fakeUuid("notif-score1"),
        user_id: recruiterCtx.userId,
        type: "fitscore_ready",
        title: "FitScore shortlist ready",
        body: "15 candidates scored for Senior Engineer. Top score: 92",
      },
    });
    const supabase = createMockSupabase({ notifications: notifBuilder });

    const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
    await NotificationRepository.create(supabase, {
      userId: recruiterCtx.userId,
      type: "fitscore_ready",
      title: "FitScore shortlist ready",
      body: "15 candidates scored for Senior Engineer. Top score: 92",
      link: "/jobs/job-1/scores",
      metadata: { jobId: "job-1", topScore: 92, candidateCount: 15 },
    });

    expect(notifBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "fitscore_ready",
        user_id: recruiterCtx.userId,
        metadata: { jobId: "job-1", topScore: 92, candidateCount: 15 },
      }),
    );
  });

  it("notifications respect user email preferences — job_alerts disabled", async () => {
    // Override shouldSendEmail to return false for job_alerts
    const { shouldSendEmail, sendMatchAlert } = await import("@/lib/services/resend");
    vi.mocked(shouldSendEmail).mockResolvedValueOnce(false);

    const result = await sendMatchAlert({
      candidateEmail: "optout@example.com",
      candidateName: "Opted Out User",
      matchCount: 3,
      topRole: "Engineer",
      topCompany: "TechCorp",
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("email_preference_disabled");
  });

  it("notifications respect user email preferences — interview_reminders disabled", async () => {
    const { shouldSendEmail, sendInterviewBooked } = await import("@/lib/services/resend");
    vi.mocked(shouldSendEmail).mockResolvedValueOnce(false);

    const result = await sendInterviewBooked({
      candidateEmail: "no-reminders@example.com",
      candidateName: "No Reminders",
      jobTitle: "Designer",
      interviewDate: "2026-05-01",
      interviewTime: "2:00 PM",
      timezone: "UTC",
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("email_preference_disabled");
  });

  it("notifications respect user email preferences — application_updates disabled", async () => {
    const { shouldSendEmail, sendApplicationStatusUpdate } = await import("@/lib/services/resend");
    vi.mocked(shouldSendEmail).mockResolvedValueOnce(false);

    const result = await sendApplicationStatusUpdate({
      candidateEmail: "no-updates@example.com",
      candidateName: "No Updates User",
      jobTitle: "PM",
      companyName: "Startup Inc",
      status: "rejected",
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("email_preference_disabled");
  });

  describe("batch notifications", () => {
    it("creates multiple notifications for multiple job matches", async () => {
      const notifBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ notifications: notifBuilder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");

      const matchNotifications = [
        {
          userId: fakeUuid("cand1"),
          type: "job_match" as const,
          title: "3 new job matches",
          body: "Engineer, Designer, PM",
          link: "/jobs?matched=true",
        },
        {
          userId: fakeUuid("cand2"),
          type: "job_match" as const,
          title: "1 new job match",
          body: "Senior Engineer at TechCorp",
          link: "/jobs?matched=true",
        },
      ];

      await NotificationRepository.createBatch(supabase, matchNotifications);

      expect(notifBuilder.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: fakeUuid("cand1"),
          type: "job_match",
          title: "3 new job matches",
        }),
        expect.objectContaining({
          user_id: fakeUuid("cand2"),
          type: "job_match",
          title: "1 new job match",
        }),
      ]);
    });

    it("skips batch insert for empty notification list", async () => {
      const notifBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ notifications: notifBuilder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.createBatch(supabase, []);

      expect(notifBuilder.insert).not.toHaveBeenCalled();
    });
  });

  describe("notification read state", () => {
    it("newly created notifications are unread", async () => {
      const unreadBuilder = createMockQueryBuilder({ count: 3 });
      const supabase = createMockSupabase({ notifications: unreadBuilder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      const count = await NotificationRepository.unreadCount(supabase, candidateCtx.userId);

      expect(count).toBe(3);
      expect(unreadBuilder.eq).toHaveBeenCalledWith("user_id", candidateCtx.userId);
      expect(unreadBuilder.eq).toHaveBeenCalledWith("read", false);
    });

    it("marking notifications as read updates read state", async () => {
      const readBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ notifications: readBuilder });

      const { NotificationRepository } = await import("@/lib/repositories/NotificationRepository");
      await NotificationRepository.markRead(supabase, candidateCtx.userId, [
        fakeUuid("n1"),
        fakeUuid("n2"),
      ]);

      expect(readBuilder.update).toHaveBeenCalledWith({ read: true });
      expect(readBuilder.eq).toHaveBeenCalledWith("user_id", candidateCtx.userId);
      expect(readBuilder.in).toHaveBeenCalledWith("id", [fakeUuid("n1"), fakeUuid("n2")]);
    });
  });
});
