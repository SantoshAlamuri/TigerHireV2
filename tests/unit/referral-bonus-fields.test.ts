import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReferralConfigPayload } from "@/components/dashboard/JobReferralBonusFormFields";

/**
 * The referral block was restyled — every input rewritten. The payload builder
 * reads fixed `ref_*` FormData keys, so a renamed input silently sends zero and
 * the job saves with no bonuses. That is the same failure that removed the
 * salary band from the edit form, so it gets the same guard.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/components/dashboard/JobReferralBonusFormFields.tsx"),
  "utf8",
);

describe("referral bonus fields", () => {
  it("renders an input for every key the payload builder reads", () => {
    const read = [...SRC.matchAll(/form\.get\("(ref_[a-z_]+)"\)/g)].map((m) => m[1]);
    // Names arrive two ways: literal name="..." and the BONUS_FIELDS constant
    // the money inputs are generated from. Reading only the literals reported
    // four real fields as missing.
    const rendered = new Set([
      ...[...SRC.matchAll(/name="(ref_[a-z_]+)"/g)].map((m) => m[1]),
      ...[...SRC.matchAll(/name: "(ref_[a-z_]+)"/g)].map((m) => m[1]),
    ]);
    expect(read.length).toBe(7);
    expect(read.filter((k) => !rendered.has(k))).toEqual([]);
  });

  it("builds the payload from those keys", () => {
    const f = new FormData();
    f.set("ref_direct_bonus", "15000");
    f.set("ref_parent_bonus", "5000");
    f.set("ref_candidate_bonus", "8000");
    f.set("ref_vouch_bonus", "0");
    f.set("ref_bonus_trigger", "day_90");
    f.set("ref_candidate_referrer_enabled", "on");
    const p = buildReferralConfigPayload(f, true);
    expect(p.direct_bonus_amount).toBe(15000);
    expect(p.bonus_trigger).toBe("day_90");
    expect(p.candidate_referrer_enabled).toBe(true);
  });

  it("falls back to offer_accepted on an unknown milestone", () => {
    const f = new FormData();
    f.set("ref_bonus_trigger", "nonsense");
    expect(buildReferralConfigPayload(f, true).bonus_trigger).toBe("offer_accepted");
  });

  it("sends zeros rather than NaN when the fields were never rendered", () => {
    // Payouts switched off means the inputs are not in the DOM at all.
    const p = buildReferralConfigPayload(new FormData(), false);
    expect(p.enabled).toBe(false);
    expect(p.direct_bonus_amount).toBe(0);
    expect(Number.isNaN(p.vouch_bonus_amount)).toBe(false);
  });
});

describe("the total only counts bonuses that can actually pay", () => {
  it("marks exactly the two bonuses payout-trigger reads as live", () => {
    // payout-trigger.ts selects bonus_trigger, direct_bonus_amount,
    // employee_bonus_amount and parent_bonus_amount. Nothing reads the
    // candidate-as-referrer or vouch amounts.
    const live = [...SRC.matchAll(/name: "(ref_[a-z_]+)",[\s\S]{0,200}?live: true/g)].map(
      (m) => m[1],
    );
    // The candidate rate is paid now; the vouch bonus still has no record to
    // attach to, so it stays marked as configured-only.
    expect(live.sort()).toEqual(["ref_candidate_bonus", "ref_direct_bonus", "ref_parent_bonus"]);
  });

  it("says so on the inert fields rather than leaving them looking funded", () => {
    expect(SRC).toMatch(/no payout runs on this yet/);
    expect(SRC).toMatch(/configured, not paid/);
  });

  it("keeps the engine's own field list in sync with what is marked live", () => {
    // If the engine starts paying the vouch bonus, this fails and the form has
    // to be updated — the two must not drift apart silently.
    //
    // Reads payout-milestone, which owns the config lookup since day 90 forced
    // the payout logic out of the status-change path it used to live in.
    const engine = readFileSync(join(process.cwd(), "src/lib/agents/payout-milestone.ts"), "utf8");
    expect(engine).toMatch(/direct_bonus_amount/);
    expect(engine).toMatch(/parent_bonus_amount/);
    expect(engine).toMatch(/candidate_referrer_bonus_amount/);
    // Still nothing to attach a vouch payout to.
    expect(engine).not.toMatch(/vouch_bonus_amount/);
  });
});
