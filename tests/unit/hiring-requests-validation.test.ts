import { describe, it, expect } from "vitest";
import { createHiringRequestSchema } from "@/lib/validations/hiring-requests";

describe("createHiringRequestSchema", () => {
  it("accepts valid minimal input (title only)", () => {
    const result = createHiringRequestSchema.safeParse({
      title: "Senior Engineer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Senior Engineer");
      expect(result.data.headcount).toBe(1);
      expect(result.data.urgency).toBe("normal");
    }
  });

  it("trims title", () => {
    const result = createHiringRequestSchema.safeParse({
      title: "  Backend Dev  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Backend Dev");
  });

  it("rejects empty title", () => {
    expect(createHiringRequestSchema.safeParse({ title: "" }).success).toBe(false);
    expect(createHiringRequestSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = createHiringRequestSchema.safeParse({
      title: "PM",
      department: "Product",
      headcount: 2,
      urgency: "high",
      description: "Lead roadmap",
      notes: "ASAP",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.department).toBe("Product");
      expect(result.data.headcount).toBe(2);
      expect(result.data.urgency).toBe("high");
    }
  });

  it("rejects invalid urgency", () => {
    const result = createHiringRequestSchema.safeParse({
      title: "Dev",
      urgency: "mega",
    });
    expect(result.success).toBe(false);
  });

  it("accepts critical and urgent urgency", () => {
    expect(createHiringRequestSchema.safeParse({ title: "Dev", urgency: "critical" }).success).toBe(
      true,
    );
    expect(createHiringRequestSchema.safeParse({ title: "Dev", urgency: "urgent" }).success).toBe(
      true,
    );
  });
});
