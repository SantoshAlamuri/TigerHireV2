import { describe, expect, it } from "vitest";
import { looksLikeApplyIntent } from "@/lib/whatsapp/referral-flow";
import { isNumericRolePickReply, resolveRolePickPhase } from "@/lib/whatsapp/role-pick-routing";

describe("role-pick-routing", () => {
  it("detects category pick phase from state or desynced context", () => {
    expect(
      resolveRolePickPhase({
        session_state: "role_family_selection",
        context: {},
      }),
    ).toBe("category");

    expect(
      resolveRolePickPhase({
        session_state: "cv_requested",
        context: {
          guided_role_options: [
            {
              label: "Engineering",
              matchField: "role_function",
              matchValue: "engineering",
              count: 2,
            },
          ],
        },
      }),
    ).toBe("category");
  });

  it("detects job pick phase when guided_job_options exist", () => {
    expect(
      resolveRolePickPhase({
        session_state: "role_job_selection",
        context: {},
      }),
    ).toBe("job");

    expect(
      resolveRolePickPhase({
        session_state: "cv_requested",
        context: {
          guided_job_options: [{ id: "job-1", title: "QA Engineer", location: "Remote" }],
        },
      }),
    ).toBe("job");
  });

  it("does not treat plain cv_requested as a pick phase", () => {
    expect(resolveRolePickPhase({ session_state: "cv_requested", context: {} })).toBeNull();
  });

  it("routes numeric replies in pick phase but not apply/refer disambiguation", () => {
    expect(
      isNumericRolePickReply("1", {
        session_state: "cv_requested",
        context: {
          guided_role_options: [
            {
              label: "Engineering",
              matchField: "role_function",
              matchValue: "engineering",
              count: 1,
            },
          ],
        },
      } as never),
    ).toBe(true);

    expect(
      looksLikeApplyIntent("1", {
        sessionState: "cv_requested",
        context: {
          guided_role_options: [
            {
              label: "Engineering",
              matchField: "role_function",
              matchValue: "engineering",
              count: 1,
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      looksLikeApplyIntent("1", {
        sessionState: "new",
        context: { awaiting_mode_choice: true },
      }),
    ).toBe(true);
  });
});
