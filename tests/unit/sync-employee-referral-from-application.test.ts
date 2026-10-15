import { describe, expect, it } from "vitest";
import { applicationStatusToEmployeeReferralStatus } from "@/lib/referrals/sync-employee-referral-from-application";

describe("sync-employee-referral-from-application", () => {
  it("maps application statuses to employee_referrals statuses", () => {
    expect(applicationStatusToEmployeeReferralStatus("applied")).toBe("cv_received");
    expect(applicationStatusToEmployeeReferralStatus("viewed")).toBe("scored");
    expect(applicationStatusToEmployeeReferralStatus("shortlisted")).toBe("shortlisted");
    expect(applicationStatusToEmployeeReferralStatus("hired")).toBe("hired");
    expect(applicationStatusToEmployeeReferralStatus("rejected")).toBe("rejected");
    expect(applicationStatusToEmployeeReferralStatus("withdrawn")).toBe("rejected");
    expect(applicationStatusToEmployeeReferralStatus("unknown")).toBeNull();
  });
});
