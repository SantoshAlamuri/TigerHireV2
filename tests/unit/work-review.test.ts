import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_THRESHOLDS,
  agentSummary,
  criterionRows,
  decisionLog,
  defaultMode,
  groupForTriage,
  isFallbackScore,
  isTypingTarget,
  keyAction,
  logistics,
  rejectChoices,
  resolveThresholds,
  risks,
  sessionSummary,
  tierFor,
  upNext,
  verifiedQuotes,
} from "@/lib/work/review";
import { REJECT_REASONS } from "@/lib/v2/review-queue";

const T = { strong: 80, good: 65, moderate: 45, weak: 25 };

describe("tiers", () => {
  it("uses the job's own cut-offs when present", () => {
    expect(resolveThresholds(T)).toEqual({ t: T, fromJob: true });
    expect(resolveThresholds({ strong: 80 })).toEqual({
      t: DEFAULT_REVIEW_THRESHOLDS,
      fromJob: false,
    });
    expect(resolveThresholds(null).fromJob).toBe(false);
  });

  it("splits strong, borderline and below on good and moderate", () => {
    expect(tierFor(65, T)).toBe("strong");
    expect(tierFor(64, T)).toBe("borderline");
    expect(tierFor(45, T)).toBe("borderline");
    expect(tierFor(44, T)).toBe("below");
    expect(tierFor(null, T)).toBe("unscored");
    expect(tierFor(0, T)).toBe("unscored");
  });

  it("groups undecided people, highest first, dropping empty groups", () => {
    const items = [
      { id: "a", name: "Asha", score: 50 },
      { id: "b", name: "Bo", score: 90 },
      { id: "c", name: "Cy", score: 70 },
      { id: "d", name: "Dee", score: 60 },
      { id: "e", name: "Eve", score: null },
    ];
    const g = groupForTriage(items, ["c"], T);
    expect(g.map((x) => x.tier)).toEqual(["strong", "borderline", "unscored"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["b"]);
    expect(g[1].items.map((i) => i.id)).toEqual(["d", "a"]);
  });

  it("starts in the list only when many are waiting", () => {
    expect(defaultMode(11)).toBe("focus");
    expect(defaultMode(12)).toBe("list");
  });

  it("lists who is up next, skipping decided and wrapping", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(upNext(items, 1, ["c"]).map((i) => i.id)).toEqual(["d", "a"]);
    expect(upNext(items, 0, [], 2).map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("evidence", () => {
  it("shows only quotes that passed verbatim validation", () => {
    const q = verifiedQuotes({
      quotes: [
        { dimension: "system_design", quote: "Designed a sharded ledger", location_hint: "Acme" },
        { dimension: "testing", quote: "NO_DEFENSIBLE_QUOTE" },
        { dimension: "x", quote: "  " },
        { dimension: "y", quote: "fine", location_hint: "No quote entry returned by model" },
        { dimension: "system_design", quote: "designed  a sharded ledger" },
        null,
      ],
    });
    expect(q).toEqual([
      { dimension: "system_design", quote: "Designed a sharded ledger", where: "Acme" },
      { dimension: "y", quote: "fine" },
    ]);
    expect(verifiedQuotes(null)).toEqual([]);
    expect(verifiedQuotes({ quotes: "nope" })).toEqual([]);
  });

  it("builds one line per criterion, heaviest first, with stored scores only", () => {
    const rows = criterionRows({
      weights: { system_design: 30, core_language: 50, testing: 20 },
      dimensions: { core_language: { value: 8 }, system_design: { value: 6.4 } },
      quotes: [
        { dimension: "core_language", quote: "Go for 6 years" },
        { dimension: "leadership", quote: "Led 5 engineers" },
      ],
    });
    expect(rows.map((r) => [r.key, r.weight, r.score, r.quote?.quote ?? null])).toEqual([
      ["core_language", 50, "8/10", "Go for 6 years"],
      ["system_design", 30, "6/10", null],
      ["testing", 20, null, null],
      ["leadership", null, null, "Led 5 engineers"],
    ]);
    expect(rows[0].label).toBe("Core language");
  });

  it("reads fractional weights and three-stage grades", () => {
    const rows = criterionRows({
      weights: { a: 0.6, b: 0.4 },
      breakdown: [{ criterion_id: "b", criterion_name: "Billing domain", grade: "b", weight: 40 }],
      quotes: [],
    });
    expect(rows.map((r) => [r.key, r.weight, r.score])).toEqual([
      ["a", 60, null],
      ["b", 40, "B"],
    ]);
  });

  it("lists red flags before amber, without placeholders or repeats", () => {
    expect(
      risks(["Gap in 2022", null, "NO_DEFENSIBLE_QUOTE"], ["gap in 2022", "Check notice"]),
    ).toEqual([
      { text: "Gap in 2022", tier: "red" },
      { text: "Check notice", tier: "amber" },
    ]);
  });

  it("strips the frozen score claim from the agent's line", () => {
    expect(agentSummary("FitScore 56 (Moderate Fit): Strong backend, light on testing.")).toBe(
      "Strong backend, light on testing.",
    );
    expect(agentSummary(null)).toBe("");
  });

  it("flags the deterministic fallback", () => {
    expect(isFallbackScore("deterministic_fallback")).toBe(true);
    expect(isFallbackScore("hybrid")).toBe(false);
  });

  it("shows only the logistics the candidate gave", () => {
    expect(
      logistics({ notice_period_days: 0, expected_ctc_lpa: 18, offers_in_hand: 0, location: " " }),
    ).toEqual([
      { label: "Notice", value: "Can start now" },
      { label: "Pay ask", value: "₹18 lakh a year" },
    ]);
    expect(logistics({})).toEqual([]);
  });
});

describe("decisions", () => {
  it("keeps the classic reject reason ids", () => {
    expect(rejectChoices().map((r) => r.id)).toEqual(REJECT_REASONS.map((r) => r.id));
    expect(rejectChoices().find((r) => r.id === "other")?.label).toBe("Other");
  });

  it("writes plain log lines", () => {
    expect(decisionLog("advance", "Asha")).toBe("Moved Asha to interview");
    expect(decisionLog("hold", 3)).toBe("Put 3 candidates on hold");
    expect(decisionLog("reject", "Bo", "compensation")).toBe(
      "Marked Bo not a fit: compensation fit",
    );
    expect(
      sessionSummary([
        { id: "1", decision: "advance", reason: null },
        { id: "2", decision: "reject", reason: "skills" },
      ]),
    ).toBe("2 decisions: 1 to interview, 1 not a fit.");
  });
});

describe("keys", () => {
  it("maps the classic keys and leaves modified keys alone", () => {
    expect(keyAction({ key: "a" }, false)).toEqual({ kind: "advance" });
    expect(keyAction({ key: "H" }, false)).toEqual({ kind: "hold" });
    expect(keyAction({ key: "r" }, false)).toEqual({ kind: "reject" });
    expect(keyAction({ key: "j" }, false)).toEqual({ kind: "next" });
    expect(keyAction({ key: "k" }, false)).toEqual({ kind: "prev" });
    expect(keyAction({ key: "a", metaKey: true }, false)).toBeNull();
    expect(keyAction({ key: "x" }, false)).toBeNull();
  });

  it("only takes Escape and a reason number while asking why", () => {
    expect(keyAction({ key: "a" }, true)).toBeNull();
    expect(keyAction({ key: "Escape" }, true)).toEqual({ kind: "cancel" });
    expect(keyAction({ key: "2" }, true)).toEqual({ kind: "reason", id: REJECT_REASONS[1].id });
    expect(keyAction({ key: "9" }, true)).toBeNull();
  });

  it("ignores keys typed into fields but not on checkboxes", () => {
    const el = (tagName: string, type?: string) =>
      ({
        closest: () => ({ tagName, getAttribute: () => type ?? null }),
      }) as unknown as Element;
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("INPUT", "checkbox"))).toBe(false);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget({ closest: () => null } as unknown as Element)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
