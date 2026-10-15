import { describe, it, expect } from "vitest";
import { contactSchema } from "@/lib/validations/contact";

describe("contactSchema", () => {
  it("accepts valid minimal input", () => {
    const result = contactSchema.safeParse({
      name: "Jane",
      email: "jane@example.com",
      message: "Hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Jane");
      expect(result.data.email).toBe("jane@example.com");
      expect(result.data.message).toBe("Hello");
      expect(result.data.company).toBe("");
      expect(result.data.type).toBe("other");
    }
  });

  it("accepts all fields", () => {
    const result = contactSchema.safeParse({
      name: "John",
      email: "john@test.com",
      message: "Message",
      company: "Acme",
      type: "company",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("company");
      expect(result.data.company).toBe("Acme");
    }
  });

  it("rejects missing name", () => {
    const result = contactSchema.safeParse({
      email: "a@b.com",
      message: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = contactSchema.safeParse({
      name: "A",
      email: "not-email",
      message: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty message", () => {
    const result = contactSchema.safeParse({
      name: "A",
      email: "a@b.com",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = contactSchema.safeParse({
      name: "A",
      email: "a@b.com",
      message: "Hi",
      type: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
