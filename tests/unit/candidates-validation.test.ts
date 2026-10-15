import { describe, it, expect } from "vitest";
import {
  candidateQuerySchema,
  updateCandidateSchema,
  unlockCandidateSchema,
} from "@/lib/validations/candidates";

describe("candidateQuerySchema", () => {
  it("accepts valid query with defaults", () => {
    const result = candidateQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe("intent_score");
      expect(result.data.sortOrder).toBe("desc");
    }
  });

  it("accepts valid query with all optional params", () => {
    const result = candidateQuerySchema.safeParse({
      search: "engineer",
      skills: "React, TypeScript",
      location: "Mumbai",
      minIntentScore: 50,
      minExperience: 2,
      maxExperience: 10,
      page: 2,
      limit: 10,
      sortBy: "created_at",
      sortOrder: "asc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("engineer");
      expect(result.data.minIntentScore).toBe(50);
      expect(result.data.sortBy).toBe("created_at");
    }
  });

  it("rejects invalid sortBy", () => {
    const result = candidateQuerySchema.safeParse({
      sortBy: "invalid_field",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sortOrder", () => {
    const result = candidateQuerySchema.safeParse({
      sortOrder: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = candidateQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects page < 1", () => {
    const result = candidateQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });
});

describe("updateCandidateSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateCandidateSchema.safeParse({ name: "Jane Doe" });
    expect(result.success).toBe(true);
  });

  it("accepts valid email", () => {
    const result = updateCandidateSchema.safeParse({
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = updateCandidateSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = updateCandidateSchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });
});

describe("unlockCandidateSchema", () => {
  it("accepts valid jobId UUID", () => {
    const result = unlockCandidateSchema.safeParse({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid jobId", () => {
    const result = unlockCandidateSchema.safeParse({ jobId: "not-uuid" });
    expect(result.success).toBe(false);
  });
});
