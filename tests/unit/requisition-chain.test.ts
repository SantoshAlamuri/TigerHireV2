import { describe, it, expect } from "vitest";
import {
  describeChain,
  resolveChain,
  validateChain,
  type ChainDef,
  type RequisitionFacts,
} from "@/lib/workflows/requisition-chain";

const ROLE_LABELS = {
  recruiter: "Recruiter",
  leadership: "Company Admin",
  finance: "Finance",
  hiring_manager: "Hiring Manager",
};

function chain(steps: ChainDef["steps"]): ChainDef {
  return { id: "chain-1", name: "Test chain", steps };
}

function facts(over: Partial<RequisitionFacts> = {}): RequisitionFacts {
  return {
    raiserRole: "hiring_manager",
    raiserProfileId: "profile-hm",
    budgetMax: 2_000_000,
    ...over,
  };
}

/** The operator's stated policy: HM raises → Company Admin → Recruiter works it. */
const HM_TO_ADMIN = chain([{ approverRole: "leadership", stepOrder: 1, slaHours: 8 }]);

describe("resolving a chain for one requisition", () => {
  it("keeps the steps in order and stamps who may not approve", () => {
    const out = resolveChain(
      chain([
        { approverRole: "recruiter", stepOrder: 1, slaHours: 8 },
        { approverRole: "leadership", stepOrder: 2, slaHours: 24 },
      ]),
      facts(),
    );
    expect(out.steps.map((s) => [s.approverRole, s.stageOrder, s.slaHours])).toEqual([
      ["recruiter", 1, 8],
      ["leadership", 2, 24],
    ]);
    // Nobody approves their own requisition.
    expect(out.steps.every((s) => s.excludeProfileId === "profile-hm")).toBe(true);
    expect(out.autoApprove).toBe(false);
  });

  it("keeps parallel steps parallel", () => {
    const out = resolveChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8 },
        { approverRole: "leadership", stepOrder: 1, slaHours: 8 },
      ]),
      facts(),
    );
    // Collapsing these into a sequence would change the policy, not apply it.
    expect(out.steps.map((s) => s.stageOrder)).toEqual([1, 1]);
  });

  it("gives two steps with the same role distinct keys", () => {
    // A second sign-off later in the chain is legitimate; a duplicate key would
    // make the runtime overwrite one of them.
    const out = resolveChain(
      chain([
        { approverRole: "leadership", stepOrder: 1, slaHours: 8 },
        { approverRole: "leadership", stepOrder: 2, slaHours: 8 },
      ]),
      facts(),
    );
    expect(out.steps.map((s) => s.stageKey)).toEqual(["leadership", "leadership_2"]);
  });
});

describe("skip rules", () => {
  it("skips a step the raiser's own role bypasses, and says why", () => {
    const out = resolveChain(
      chain([
        {
          approverRole: "leadership",
          stepOrder: 1,
          slaHours: 8,
          skipWhenRaiserRole: ["leadership"],
        },
        { approverRole: "finance", stepOrder: 2, slaHours: 8 },
      ]),
      facts({ raiserRole: "leadership" }),
    );
    expect(out.steps.map((s) => s.approverRole)).toEqual(["finance"]);
    expect(out.skipped).toEqual([
      {
        approverRole: "leadership",
        reason: "raised by leadership, whose own requisitions bypass this step",
      },
    ]);
  });

  it("closes the gap a skip leaves, so nothing waits on a step that is gone", () => {
    const out = resolveChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8, skipWhenRaiserRole: ["leadership"] },
        { approverRole: "leadership", stepOrder: 2, slaHours: 8 },
      ]),
      facts({ raiserRole: "leadership" }),
    );
    expect(out.steps.map((s) => s.stageOrder)).toEqual([1]);
  });

  it("skips a step under a budget threshold", () => {
    const out = resolveChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8, skipWhenBudgetBelow: 3_000_000 },
      ]),
      facts({ budgetMax: 2_000_000 }),
    );
    expect(out.steps).toHaveLength(0);
    expect(out.skipped[0].reason).toContain("under the 3000000 threshold");
  });

  it("applies a step when the budget is at or above the threshold", () => {
    const out = resolveChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8, skipWhenBudgetBelow: 3_000_000 },
      ]),
      facts({ budgetMax: 3_000_000 }),
    );
    expect(out.steps).toHaveLength(1);
  });

  it("never skips on budget when no budget was captured", () => {
    // Absent data is not "below the threshold" — that would let an unbudgeted
    // requisition slip past the very control the threshold exists for.
    const out = resolveChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8, skipWhenBudgetBelow: 3_000_000 },
      ]),
      facts({ budgetMax: null }),
    );
    expect(out.steps).toHaveLength(1);
    expect(out.skipped).toEqual([]);
  });

  it("treats a null threshold as 'always applies', not as zero", () => {
    const out = resolveChain(
      chain([{ approverRole: "finance", stepOrder: 1, slaHours: 8, skipWhenBudgetBelow: null }]),
      facts({ budgetMax: 0 }),
    );
    expect(out.steps).toHaveLength(1);
  });
});

/**
 * The dangerous case. An empty plan and a deliberate no-approval policy look
 * identical to the runtime, which completes both instantly — so the difference
 * has to be stated rather than inferred.
 */
describe("auto-approval is stated, never inferred", () => {
  it("BLOCKS (does not auto-approve) when a chain's authored steps were all skipped (#351)", () => {
    // An authored chain whose only step is skipped is an ACCIDENT, not a policy —
    // it must not silently auto-approve; the caller falls back to a real chain.
    const out = resolveChain(
      chain([
        {
          approverRole: "leadership",
          stepOrder: 1,
          slaHours: 8,
          skipWhenRaiserRole: ["leadership"],
        },
      ]),
      facts({ raiserRole: "leadership" }),
    );
    expect(out.autoApprove).toBe(false);
    expect(out.blockedNoApprovers).toBe(true);
    expect(out.blockedReason).toContain("every authored step was skipped");
    expect(out.blockedReason).toContain("bypass this step");
  });

  it("auto-approves ONLY when the org authored an empty chain (explicit no-approval policy) (#351)", () => {
    const out = resolveChain(chain([]), facts());
    expect(out.autoApprove).toBe(true);
    expect(out.blockedNoApprovers).toBe(false);
    expect(out.autoApproveReason).toContain("no approval steps");
  });

  it("does not auto-approve while any step survives", () => {
    expect(resolveChain(HM_TO_ADMIN, facts()).autoApprove).toBe(false);
  });
});

describe("describing a chain in a sentence", () => {
  it("reads as the policy someone can check against their own", () => {
    expect(describeChain(HM_TO_ADMIN, ROLE_LABELS)).toBe(
      "Raised → Company Admin → recruiter works it",
    );
  });

  it("joins parallel approvers with 'and', because they happen together", () => {
    const out = describeChain(
      chain([
        { approverRole: "finance", stepOrder: 1, slaHours: 8 },
        { approverRole: "leadership", stepOrder: 1, slaHours: 8 },
      ]),
      ROLE_LABELS,
    );
    expect(out).toBe("Raised → Finance and Company Admin → recruiter works it");
  });

  it("says plainly when a chain approves everything on sight", () => {
    expect(describeChain(chain([]), ROLE_LABELS)).toContain("approved immediately");
  });
});

describe("validating a chain before it is saved", () => {
  const PRESENT = ["recruiter", "leadership", "hiring_manager"];

  it("accepts a chain every step of which someone can action", () => {
    expect(validateChain(HM_TO_ADMIN, PRESENT)).toEqual({ ok: true, problems: [] });
  });

  it("refuses a step routed to a role the org does not have", () => {
    // The exact failure this whole feature exists to fix: both shipped presets
    // require Finance, and an org without a finance function waits forever.
    const out = validateChain(
      chain([{ approverRole: "finance", stepOrder: 1, slaHours: 8 }]),
      PRESENT,
    );
    expect(out.ok).toBe(false);
    expect(out.problems[0]).toContain("No active finance");
  });

  it("flags an empty chain as a decision to confirm, not a form to submit", () => {
    const out = validateChain(chain([]), PRESENT);
    expect(out.ok).toBe(false);
    expect(out.problems[0]).toContain("approved automatically");
  });

  it("refuses an SLA that can never be met", () => {
    const out = validateChain(
      chain([{ approverRole: "recruiter", stepOrder: 1, slaHours: 0 }]),
      PRESENT,
    );
    expect(out.problems.some((p) => p.includes("can never be met"))).toBe(true);
  });

  it("refuses a budget threshold no budget can fall under", () => {
    const out = validateChain(
      chain([{ approverRole: "recruiter", stepOrder: 1, slaHours: 8, skipWhenBudgetBelow: 0 }]),
      PRESENT,
    );
    expect(out.problems.some((p) => p.includes("no budget can fall under"))).toBe(true);
  });
});
