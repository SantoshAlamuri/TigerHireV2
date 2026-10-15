import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema, magicLinkSchema } from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "Demo@1234" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-email", password: "Demo@1234" });
    expect(result.success).toBe(false);
  });

  it("accepts non-empty password of any length (Supabase enforces credentials)", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    email: "user@company.com",
    password: "Secure@123",
    fullName: "Test User",
    userType: "company" as const,
    organisationName: "TestCo",
  };

  it("accepts valid registration data", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid userType", () => {
    const result = registerSchema.safeParse({ ...valid, userType: "hacker" });
    expect(result.success).toBe(false);
  });

  it("requires fullName of at least 2 chars", () => {
    const result = registerSchema.safeParse({ ...valid, fullName: "A" });
    expect(result.success).toBe(false);
  });

  it("organisationName is optional", () => {
    const { organisationName, ...minimal } = valid;
    void organisationName;
    expect(registerSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("magicLinkSchema", () => {
  it("accepts valid email", () => {
    expect(magicLinkSchema.safeParse({ email: "user@test.com" }).success).toBe(true);
  });

  it("rejects empty email", () => {
    expect(magicLinkSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
