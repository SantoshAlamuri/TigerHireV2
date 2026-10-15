import { describe, it, expect } from "vitest";
import { waitlistSchema } from "@/lib/validations/waitlist";

describe("waitlistSchema", () => {
  it("accepts valid email only (defaults type to candidate)", () => {
    const result = waitlistSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
      expect(result.data.type).toBe("candidate");
    }
  });

  it("accepts email and type company", () => {
    const result = waitlistSchema.safeParse({
      email: "company@test.com",
      type: "company",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("company");
    }
  });

  it("rejects invalid email", () => {
    const result = waitlistSchema.safeParse({ email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = waitlistSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = waitlistSchema.safeParse({
      email: "a@b.com",
      type: "press",
    });
    expect(result.success).toBe(false);
  });
});
