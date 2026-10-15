import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({
  env: {
    baseUrl: "https://app.test.com",
    get emailBrandingLogoUrl() {
      return "https://app.test.com/logo-light.svg";
    },
  },
}));

import {
  emailLayout,
  matchAlertHtml,
  inviteHtml,
  interviewBookedHtml,
  interviewCancelledHtml,
  applicationStatusUpdateHtml,
  applicationConfirmationHtml,
  fitScoreReadyHtml,
  applicationWithdrawnHtml,
  interviewRescheduledHtml,
  interviewReminderHtml,
  contactNotificationHtml,
  newInboxMessageNotificationHtml,
  savedSearchJobAlertHtml,
} from "@/lib/services/email-templates";

describe("emailTemplates", () => {
  describe("emailLayout", () => {
    it("wraps content in TigerHire-branded HTML", () => {
      const html = emailLayout({ body: "<p>Hello</p>" });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("TigerHire");
      expect(html).toContain("logo-light.svg");
      expect(html).toContain("<p>Hello</p>");
    });

    it("includes preheader when provided", () => {
      const html = emailLayout({ body: "<p>Hi</p>", preheader: "Preview line here" });
      expect(html).toContain("Preview line here");
    });

    it("includes unsubscribe link by default", () => {
      const html = emailLayout({ body: "<p>Test</p>" });
      expect(html).toContain("email-preferences");
      expect(html).toContain("Manage email preferences");
    });

    it("omits unsubscribe link when showUnsubscribe is false", () => {
      const html = emailLayout({ body: "<p>Test</p>", showUnsubscribe: false });
      expect(html).not.toContain("email-preferences");
      expect(html).not.toContain("Manage email preferences");
    });

    it("includes proper HTML structure with head and body", () => {
      const html = emailLayout({ body: "<p>Content</p>" });
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("<head>");
      expect(html).toContain("<body");
      expect(html).toContain("</body>");
      expect(html).toContain("</html>");
    });

    it("includes viewport meta tag for mobile responsiveness", () => {
      const html = emailLayout({ body: "<p>Content</p>" });
      expect(html).toContain("viewport");
      expect(html).toContain("width=device-width");
    });
  });

  describe("matchAlertHtml", () => {
    it("returns HTML with candidate and job info", () => {
      const html = matchAlertHtml({
        candidateName: "Alice",
        matchCount: 5,
        topRole: "Senior Engineer",
        topCompany: "TechCo",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("5 companies");
      expect(html).toContain("Senior Engineer");
      expect(html).toContain("TechCo");
    });

    it("includes CTA link to candidate dashboard", () => {
      const html = matchAlertHtml({
        candidateName: "Bob",
        matchCount: 3,
        topRole: "PM",
        topCompany: "StartupX",
      });
      expect(html).toContain("https://app.test.com/candidate");
      expect(html).toContain("View Your Matches");
    });

    it("is wrapped in email layout with branding", () => {
      const html = matchAlertHtml({
        candidateName: "Carol",
        matchCount: 1,
        topRole: "Designer",
        topCompany: "DesignCo",
      });
      expect(html).toContain("TigerHire");
      expect(html).toContain("<!DOCTYPE html>");
    });
  });

  describe("fitScoreReadyHtml", () => {
    it("includes candidate count, role name and top score", () => {
      const html = fitScoreReadyHtml({
        candidateCount: 15,
        roleName: "Backend Engineer",
        topScore: 92,
      });
      expect(html).toContain("15 candidates");
      expect(html).toContain("Backend Engineer");
      expect(html).toContain("92/100");
    });

    it("links to recruit dashboard", () => {
      const html = fitScoreReadyHtml({
        candidateCount: 5,
        roleName: "PM",
        topScore: 85,
      });
      expect(html).toContain("https://app.test.com/recruit");
      expect(html).toContain("View Shortlist");
    });
  });

  describe("inviteHtml", () => {
    it("includes invite link with token", () => {
      const html = inviteHtml({
        inviterName: "Alice",
        organisationName: "TechCo",
        token: "abc123",
      });
      // Must point at the actual invite-acceptance route (/invite/[token]),
      // not the non-existent /join/[token] which 404s (Bug Report: Org #4).
      expect(html).toContain("https://app.test.com/invite/abc123");
      expect(html).not.toContain("/join/abc123");
      expect(html).toContain("Accept Invite");
    });

    it("includes 7-day expiry notice", () => {
      const html = inviteHtml({
        inviterName: "Bob",
        organisationName: "StartupX",
        token: "token456",
      });
      expect(html).toContain("7 days");
    });

    it("includes inviter and organisation names", () => {
      const html = inviteHtml({
        inviterName: "Carol",
        organisationName: "BigCorp",
        token: "xyz",
      });
      expect(html).toContain("Carol");
      expect(html).toContain("BigCorp");
    });

    it("does not include unsubscribe link", () => {
      const html = inviteHtml({
        inviterName: "Dan",
        organisationName: "Org",
        token: "t",
      });
      expect(html).not.toContain("Manage email preferences");
    });
  });

  describe("applicationWithdrawnHtml", () => {
    it("includes candidate name and job title", () => {
      const html = applicationWithdrawnHtml({
        candidateName: "Eve",
        jobTitle: "Data Scientist",
      });
      expect(html).toContain("Eve");
      expect(html).toContain("Data Scientist");
      expect(html).toContain("withdrawn");
    });
  });

  describe("interviewBookedHtml", () => {
    it("includes interview date, time, timezone and job title", () => {
      const html = interviewBookedHtml({
        candidateName: "Alice",
        jobTitle: "Frontend Engineer",
        interviewDate: "2026-04-01",
        interviewTime: "10:00 AM",
        timezone: "EST",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Frontend Engineer");
      expect(html).toContain("2026-04-01");
      expect(html).toContain("10:00 AM");
      expect(html).toContain("EST");
      expect(html).toContain("Interview Confirmed");
    });

    it("includes reschedule notice", () => {
      const html = interviewBookedHtml({
        candidateName: "Bob",
        jobTitle: "PM",
        interviewDate: "2026-05-15",
        interviewTime: "2:00 PM",
        timezone: "PST",
      });
      expect(html).toContain("reschedule");
    });
  });

  describe("interviewCancelledHtml", () => {
    it("includes cancellation notice with job title and original date", () => {
      const html = interviewCancelledHtml({
        recipientName: "Charlie",
        jobTitle: "Backend Developer",
        originalDate: "2026-04-10",
      });
      expect(html).toContain("Charlie");
      expect(html).toContain("Backend Developer");
      expect(html).toContain("2026-04-10");
      expect(html).toContain("cancelled");
    });
  });

  describe("interviewRescheduledHtml", () => {
    it("includes old and new dates", () => {
      const html = interviewRescheduledHtml({
        recipientName: "Dana",
        jobTitle: "DevOps Engineer",
        oldDate: "2026-04-01",
        newDate: "2026-04-08",
        newTime: "3:00 PM",
        timezone: "UTC",
      });
      expect(html).toContain("Rescheduled");
      expect(html).toContain("2026-04-01");
      expect(html).toContain("2026-04-08");
      expect(html).toContain("3:00 PM");
      expect(html).toContain("UTC");
    });
  });

  describe("interviewReminderHtml", () => {
    it("includes reminder with interview details", () => {
      const html = interviewReminderHtml({
        recipientName: "Eve",
        jobTitle: "QA Engineer",
        interviewDate: "2026-04-15",
        interviewTime: "9:00 AM",
        timezone: "CET",
      });
      expect(html).toContain("Reminder");
      expect(html).toContain("Eve");
      expect(html).toContain("QA Engineer");
      expect(html).toContain("2026-04-15");
      expect(html).toContain("9:00 AM");
    });
  });

  describe("applicationConfirmationHtml", () => {
    it("includes candidate, job and company info", () => {
      const html = applicationConfirmationHtml({
        candidateName: "Frank",
        jobTitle: "ML Engineer",
        companyName: "AI Corp",
      });
      expect(html).toContain("Frank");
      expect(html).toContain("ML Engineer");
      expect(html).toContain("AI Corp");
      expect(html).toContain("Application Received");
    });

    it("includes link to view applications", () => {
      const html = applicationConfirmationHtml({
        candidateName: "Grace",
        jobTitle: "Designer",
        companyName: "DesignCo",
      });
      expect(html).toContain("https://app.test.com/candidate/applications");
    });
  });

  describe("applicationStatusUpdateHtml", () => {
    it("shows 'shortlisted' status correctly", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Alice",
        jobTitle: "Engineer",
        companyName: "TechCo",
        status: "shortlisted",
      });
      expect(html).toContain("shortlisted");
      expect(html).toContain("Congratulations");
      expect(html).toContain("Engineer");
      expect(html).toContain("TechCo");
    });

    it("shows 'rejected' status correctly", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Bob",
        jobTitle: "PM",
        companyName: "StartupX",
        status: "rejected",
      });
      expect(html).toContain("move forward with other candidates");
      expect(html).toContain("PM");
      expect(html).toContain("StartupX");
    });

    it("shows 'hired' status correctly", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Carol",
        jobTitle: "Designer",
        companyName: "DesignCo",
        status: "hired",
      });
      expect(html).toContain("selected");
      expect(html).toContain("Great news");
      expect(html).toContain("Designer");
      expect(html).toContain("DesignCo");
    });

    it("shows 'in_progress' status correctly", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Dan",
        jobTitle: "SRE",
        companyName: "CloudCo",
        status: "in_progress",
      });
      expect(html).toContain("moved forward");
    });

    it("handles unknown status with raw label", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Eve",
        jobTitle: "Analyst",
        companyName: "DataCo",
        status: "custom_status",
      });
      expect(html).toContain("custom_status");
    });

    it("includes CTA to candidate dashboard", () => {
      const html = applicationStatusUpdateHtml({
        candidateName: "Frank",
        jobTitle: "Dev",
        companyName: "Co",
        status: "shortlisted",
      });
      expect(html).toContain("https://app.test.com/candidate");
      expect(html).toContain("View Dashboard");
    });
  });

  describe("newInboxMessageNotificationHtml", () => {
    it("includes sender, preview, and thread link", () => {
      const html = newInboxMessageNotificationHtml({
        recipientName: "Alex",
        senderName: "Sam Recruiter",
        messagePreview: "Can we do Tuesday 3pm?",
        threadUrl: "https://app.test.com/messages?c=abc",
      });
      expect(html).toContain("Sam Recruiter");
      expect(html).toContain("Can we do Tuesday 3pm?");
      expect(html).toContain("https://app.test.com/messages?c=abc");
      expect(html).toContain("Open conversation");
    });
  });

  describe("savedSearchJobAlertHtml", () => {
    it("lists jobs and includes settings link", () => {
      const html = savedSearchJobAlertHtml({
        name: "Pat",
        searchName: "Remote PM",
        jobCount: 2,
        jobs: [
          { title: "PM I", company: "CoA", location: "Remote", remoteOk: true },
          { title: "PM II", company: "CoB", location: "Bengaluru", remoteOk: false },
        ],
      });
      expect(html).toContain("Pat");
      expect(html).toContain("Remote PM");
      expect(html).toContain("PM I");
      expect(html).toContain("candidate/settings");
    });
  });

  describe("contactNotificationHtml", () => {
    it("includes contact form details", () => {
      const html = contactNotificationHtml({
        name: "John Doe",
        email: "john@example.com",
        company: "AcmeCo",
        type: "demo_request",
        message: "I'd like a demo",
      });
      expect(html).toContain("John Doe");
      expect(html).toContain("john@example.com");
      expect(html).toContain("AcmeCo");
      expect(html).toContain("demo_request");
      expect(html).toContain("I'd like a demo");
    });

    it("shows N/A for empty company", () => {
      const html = contactNotificationHtml({
        name: "Jane",
        email: "jane@test.com",
        company: "",
        type: "general",
        message: "Hello",
      });
      expect(html).toContain("N/A");
    });

    it("does not include unsubscribe link", () => {
      const html = contactNotificationHtml({
        name: "Test",
        email: "t@t.com",
        company: "X",
        type: "support",
        message: "Help",
      });
      expect(html).not.toContain("Manage email preferences");
    });
  });
});
