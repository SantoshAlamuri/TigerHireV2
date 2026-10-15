import { describe, it, expect } from "vitest";
import {
  CreateJobSchema,
  UpdateJobSchema,
  UnlockCandidateSchema,
  ReferCandidateSchema,
  InviteEmployeeSchema,
  CreateApplicationSchema,
  UpdateApplicationSchema,
  CreateHiringRequestSchema,
  CreateApprovalSchema,
} from "@/lib/security/validate";

describe("CreateJobSchema", () => {
  it("accepts valid job data", () => {
    const result = CreateJobSchema.safeParse({
      title: "Senior Engineer",
      description: "A".repeat(60),
    });
    expect(result.success).toBe(true);
  });

  it("rejects short title", () => {
    const result = CreateJobSchema.safeParse({
      title: "ab",
      description: "A".repeat(60),
    });
    expect(result.success).toBe(false);
  });

  it("rejects short description", () => {
    const result = CreateJobSchema.safeParse({
      title: "Engineer",
      description: "Short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = CreateJobSchema.safeParse({
      title: "Senior Engineer",
      description: "A".repeat(60),
      seniority_level: "senior",
      location: "Mumbai",
      remote_policy: "hybrid",
      employment_type: "full_time",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateJobSchema", () => {
  it("allows partial updates", () => {
    const result = UpdateJobSchema.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
  });

  it("allows empty object", () => {
    const result = UpdateJobSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("UnlockCandidateSchema", () => {
  it("accepts valid UUIDs", () => {
    const result = UnlockCandidateSchema.safeParse({
      candidate_id: "00000000-0000-4000-8000-000000000001",
      job_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUIDs", () => {
    const result = UnlockCandidateSchema.safeParse({
      candidate_id: "not-a-uuid",
      job_id: "also-not",
    });
    expect(result.success).toBe(false);
  });
});

describe("ReferCandidateSchema", () => {
  it("accepts valid referral data", () => {
    const result = ReferCandidateSchema.safeParse({
      candidate_phone: "+919876543210",
      candidate_name: "Jane Doe",
      job_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid phone number", () => {
    const result = ReferCandidateSchema.safeParse({
      candidate_phone: "123",
      candidate_name: "Jane",
      job_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(false);
  });
});

describe("InviteEmployeeSchema", () => {
  it("accepts valid invite data", () => {
    const result = InviteEmployeeSchema.safeParse({
      email: "jane@example.com",
      full_name: "Jane Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = InviteEmployeeSchema.safeParse({
      email: "not-an-email",
      full_name: "Jane",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateApplicationSchema", () => {
  it("accepts valid application", () => {
    const result = CreateApplicationSchema.safeParse({
      job_id: "00000000-0000-4000-8000-000000000001",
      interest: "interested",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid interest value", () => {
    const result = CreateApplicationSchema.safeParse({
      job_id: "00000000-0000-4000-8000-000000000001",
      interest: "meh",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateApplicationSchema", () => {
  it("accepts valid status", () => {
    const result = UpdateApplicationSchema.safeParse({ status: "hired" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = UpdateApplicationSchema.safeParse({ status: "pending" });
    expect(result.success).toBe(false);
  });
});

describe("CreateHiringRequestSchema", () => {
  it("accepts valid hiring request", () => {
    const result = CreateHiringRequestSchema.safeParse({
      title: "Frontend Engineer",
      urgency: "high",
      headcount: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects headcount over 100", () => {
    const result = CreateHiringRequestSchema.safeParse({
      title: "Mass Hiring",
      headcount: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateApprovalSchema", () => {
  it("accepts valid approval", () => {
    const result = CreateApprovalSchema.safeParse({
      pipeline_candidate_id: "00000000-0000-4000-8000-000000000001",
      decision: "approved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid decision", () => {
    const result = CreateApprovalSchema.safeParse({
      pipeline_candidate_id: "00000000-0000-4000-8000-000000000001",
      decision: "maybe",
    });
    expect(result.success).toBe(false);
  });
});
