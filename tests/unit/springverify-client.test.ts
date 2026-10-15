import { describe, expect, it } from "vitest";
import { buildSpringVerifyCreateCaseBody } from "@/lib/integrations/springverify/client";

describe("buildSpringVerifyCreateCaseBody", () => {
  const basePayload = {
    candidateName: "Priya Sharma",
    email: "priya@example.com",
    phone: "+919999999999",
    externalReference: "tigerhire:application:app-123",
    metadata: { organisation_id: "org-1", application_id: "app-123" },
  };

  it("nests candidate fields per the SpringVerify external/v1 contract", () => {
    const body = buildSpringVerifyCreateCaseBody(basePayload);
    expect(body.candidate.name).toBe("Priya Sharma");
    expect(body.candidate.email).toBe("priya@example.com");
    expect(body.candidate.phone).toBe("+919999999999");
    expect(body.candidate.meta_data).toMatchObject({
      external_reference: "tigerhire:application:app-123",
      application_id: "app-123",
      organisation_id: "org-1",
      source: "tigerhire",
    });
    // No legacy flat/assumed fields at the top level.
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("external_id");
    expect(body).not.toHaveProperty("meta");
  });

  it("omits phone when absent and package when ids are not configured", () => {
    const body = buildSpringVerifyCreateCaseBody({ ...basePayload, phone: null });
    expect(body.candidate).not.toHaveProperty("phone");
    expect(body.package).toBeUndefined();
  });

  it("includes the package block only when both ids are configured", () => {
    expect(
      buildSpringVerifyCreateCaseBody(basePayload, { packageId: 16, subtypeId: null }).package,
    ).toBeUndefined();
    expect(
      buildSpringVerifyCreateCaseBody(basePayload, { packageId: 16, subtypeId: 22 }).package,
    ).toEqual({ package_id: 16, subtype_id: 22, config: {} });
  });
});
