import { describe, it, expect } from "vitest";
import { consultantRequestDecisionSchema } from "@/lib/validations/consultant-invites";
import { canManageConsultants, canViewConsultants } from "@/lib/consultants/access";

describe("consultantRequestDecisionSchema", () => {
  it("accepts the two decisions a company can make", () => {
    expect(consultantRequestDecisionSchema.parse({ decision: "approve" }).decision).toBe("approve");
    expect(consultantRequestDecisionSchema.parse({ decision: "decline" }).decision).toBe("decline");
  });

  it("rejects anything else, so a typo cannot become a status", () => {
    for (const decision of ["active", "approved", "reject", "", null, undefined]) {
      expect(consultantRequestDecisionSchema.safeParse({ decision }).success).toBe(false);
    }
  });
});

describe("who may decide", () => {
  it("lets leadership, an org admin and a platform admin decide", () => {
    expect(canManageConsultants({ role: "leadership" })).toBe(true);
    expect(canManageConsultants({ role: "super_admin" })).toBe(true);
    expect(canManageConsultants({ role: "recruiter", isOrgAdmin: true })).toBe(true);
  });

  it("does not let a plain recruiter, a hiring manager or the agency itself decide", () => {
    expect(canManageConsultants({ role: "recruiter" })).toBe(false);
    expect(canManageConsultants({ role: "hiring_manager" })).toBe(false);
    // The requesting firm must never be able to approve its own request.
    expect(canManageConsultants({ role: "agency" })).toBe(false);
    expect(canManageConsultants({ role: "agency", isOrgAdmin: false })).toBe(false);
  });

  it("lets a recruiter see the list without being able to change it", () => {
    expect(canViewConsultants({ role: "recruiter" })).toBe(true);
    expect(canManageConsultants({ role: "recruiter" })).toBe(false);
  });

  it("does not let a candidate or the agency read the company's consultant list", () => {
    expect(canViewConsultants({ role: "candidate_free" })).toBe(false);
    expect(canViewConsultants({ role: "agency" })).toBe(false);
  });
});
