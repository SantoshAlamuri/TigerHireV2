import { describe, it, expect } from "vitest";
import {
  createJobSchema,
  updateJobSchema,
  jobQuerySchema,
  DESCRIPTION_MAX_WORDS_EXPORT,
} from "@/lib/validations/jobs";

const longDescription = "word ".repeat(50); // 50 words

describe("createJobSchema", () => {
  it("accepts valid minimal job", () => {
    const result = createJobSchema.safeParse({
      title: "Senior Engineer",
      description: longDescription,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Senior Engineer");
      expect(result.data.status).toBe("open");
    }
  });

  it("rejects title shorter than 3 characters", () => {
    const result = createJobSchema.safeParse({
      title: "Ab",
      description: longDescription,
    });
    expect(result.success).toBe(false);
  });

  it("rejects description shorter than 50 characters", () => {
    const result = createJobSchema.safeParse({
      title: "Engineer",
      description: "Short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts status draft, open, closed", () => {
    expect(
      createJobSchema.safeParse({
        title: "A".repeat(3),
        description: longDescription,
        status: "draft",
      }).success,
    ).toBe(true);
    expect(
      createJobSchema.safeParse({
        title: "A".repeat(3),
        description: longDescription,
        status: "closed",
      }).success,
    ).toBe(true);
  });

  it("rejects description over word limit", () => {
    const tooLong = "x ".repeat(DESCRIPTION_MAX_WORDS_EXPORT + 1);
    const result = createJobSchema.safeParse({
      title: "Engineer",
      description: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when neither public nor internal listing is enabled", () => {
    const result = createJobSchema.safeParse({
      title: "Senior Engineer",
      description: longDescription,
      listOnPublicJobBoard: false,
      listForInternalReferrals: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts internal-only listing", () => {
    const result = createJobSchema.safeParse({
      title: "Senior Engineer",
      description: longDescription,
      listOnPublicJobBoard: false,
      listForInternalReferrals: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional applicationsCloseAt ISO datetime", () => {
    const result = createJobSchema.safeParse({
      title: "Senior Engineer",
      description: longDescription,
      applicationsCloseAt: "2026-12-01T18:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateJobSchema", () => {
  it("accepts partial update", () => {
    const result = updateJobSchema.safeParse({ title: "Updated Title" });
    expect(result.success).toBe(true);
  });

  it("rejects description over word limit when provided", () => {
    const tooLong = "x ".repeat(DESCRIPTION_MAX_WORDS_EXPORT + 1);
    const result = updateJobSchema.safeParse({ description: tooLong });
    expect(result.success).toBe(false);
  });

  it("allows clearing applicationsCloseAt with null", () => {
    const result = updateJobSchema.safeParse({ applicationsCloseAt: null });
    expect(result.success).toBe(true);
  });
});

describe("jobQuerySchema", () => {
  it("defaults page and limit", () => {
    const result = jobQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts status, search, page, limit, cursor", () => {
    const result = jobQuerySchema.safeParse({
      status: "open",
      search: "engineer",
      page: 2,
      limit: 10,
      cursor: "abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("open");
      expect(result.data.search).toBe("engineer");
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
      expect(result.data.cursor).toBe("abc");
    }
  });

  it("rejects limit over 100", () => {
    const result = jobQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });
});
