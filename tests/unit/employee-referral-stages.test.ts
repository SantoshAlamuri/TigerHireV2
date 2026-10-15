import { describe, expect, it } from "vitest";
import {
  applicationStatusToStage,
  employeeInviteStatusToStage,
  stageLabel,
} from "@/lib/referrals/employee-referral-stages";

describe("employee-referral-stages", () => {
  it("maps invite statuses", () => {
    expect(stageLabel(employeeInviteStatusToStage("invited"))).toBe("Invite sent");
    expect(employeeInviteStatusToStage("hired")).toBe("offer");
  });

  it("maps application statuses", () => {
    expect(applicationStatusToStage("hired")).toBe("offer");
    expect(applicationStatusToStage("shortlisted")).toBe("shortlisted");
  });
});
