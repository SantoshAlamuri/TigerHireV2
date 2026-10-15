import { describe, it, expect } from "vitest";
import { dedupeFlags, flagsAreNearDuplicate } from "@/lib/fitscore/dedupe-flags";

describe("dedupeFlags", () => {
  it("removes exact and whitespace/case duplicates, preserving first-seen order", () => {
    const out = dedupeFlags([
      "No Kafka experience",
      "  no kafka experience ",
      "Strong Python background",
    ]);
    expect(out).toEqual(["No Kafka experience", "Strong Python background"]);
  });

  it("collapses reworded duplicates that share distinctive tokens (Kafka pair)", () => {
    const out = dedupeFlags([
      "No Kafka or any streaming/event-driven pipeline experience",
      "No Kafka or streaming technology mentioned anywhere in resume",
    ]);
    expect(out).toHaveLength(1);
  });

  it("collapses reworded duplicates (quantified-outcomes pair)", () => {
    const out = dedupeFlags([
      "Zero quantified metrics or measurable outcomes across all experience",
      "Zero quantified outcomes — pipeline scale, query performance gains, or data volume metrics absent",
    ]);
    expect(out).toHaveLength(1);
  });

  it("collapses the Scrum-Master tenure pair (same gap, different framing)", () => {
    const out = dedupeFlags([
      "Active Scrum Master facilitation experience is absent for 7+ years; last SM role ended in 2017",
      "Scrum Master role experience is limited to ~2 years (2015-2017); the last 7+ years have been in director, founder, and portfolio management roles — not hands-on SM facilitation",
    ]);
    expect(out).toHaveLength(1);
  });

  it("drops empty/whitespace entries", () => {
    expect(dedupeFlags(["", "   ", "Real flag", null, undefined])).toEqual(["Real flag"]);
  });

  // Guard against FALSE merges — distinct concerns must never be silently dropped.
  it("keeps genuinely distinct flags that only share generic filler words", () => {
    const distinct = ["No Spark exposure", "No Hadoop exposure", "No Kubernetes experience"];
    expect(dedupeFlags(distinct)).toHaveLength(3);
    expect(flagsAreNearDuplicate("No Spark exposure", "No Hadoop exposure")).toBe(false);
  });

  // Regression: real-world QA-role scoring output (2026-07-06). The last two bullets restate
  // the same core gap ("candidate is a developer, not a QA engineer") with different vocabulary
  // (STLC/quality assurance vs testing role/QA engineer) and previously survived dedup.
  it("collapses the developer-not-QA pair while keeping the 7 distinct QA gaps", () => {
    const bullets = [
      "No defect tracking tool usage (Jira, Azure DevOps, etc.)",
      "No performance testing experience (JMeter or equivalent)",
      "No test case design or test strategy documentation experience",
      "No Postman or API testing experience from a QA/validation perspective",
      "No functional, regression, integration, or exploratory testing experience",
      "No dedicated automation framework exposure (Selenium, Playwright, Cypress)",
      "SQL used only for backend development, not database validation in a QA context",
      "No QA or STLC experience — entire career is in software development, not quality assurance",
      "No QA or testing role experience — candidate is a backend software developer, not a QA engineer",
    ];
    const out = dedupeFlags(bullets, 20);
    expect(out).toHaveLength(8);
    // The two rewordings of the same gap merged…
    expect(flagsAreNearDuplicate(bullets[7], bullets[8])).toBe(true);
    // …while nearby same-domain but distinct concerns did not.
    expect(flagsAreNearDuplicate(bullets[7], bullets[6])).toBe(false);
    expect(flagsAreNearDuplicate(bullets[1], bullets[4])).toBe(false);
  });
});

describe("dedupeFlags — #392 regressions (red_flags vs ideal_gaps restating one gap)", () => {
  // Exact strings from the production score that showed 7 gaps where there were 5.
  const red = [
    "Only AWS Cloud Practitioner (CLF-C02) held — no Solutions Architect Associate/Professional or Azure/GCP architect-level certification despite 21 years experience",
    "No Terraform or any IaC tooling mentioned anywhere on the resume",
    "No enterprise-scale Databricks architecture evidence; Databricks listed only as a single bullet in a technology list with no project context",
    "Single primary cloud focus (AWS); Azure usage appears limited to AI/DevOps tooling rather than infrastructure architecture",
  ];
  const ideal = [
    "No Databricks-specific architecture experience demonstrated (Unity Catalog, Delta Lake, Lakehouse design, cluster optimization)",
    "No Terraform or Infrastructure-as-Code tooling evident",
    "No explicit Well-Architected Framework deep-dive beyond a single mention in migration context",
  ];

  it("treats 'IaC' and 'Infrastructure-as-Code' as the same gap", () => {
    expect(flagsAreNearDuplicate(ideal[1], red[1])).toBe(true);
  });

  it("merges the two Databricks-architecture gaps despite different wording", () => {
    expect(flagsAreNearDuplicate(ideal[0], red[2])).toBe(true);
  });

  it("collapses the production list from 7 to 5 distinct gaps, first-seen wins", () => {
    const out = dedupeFlags([...red, ...ideal], 20);
    expect(out).toHaveLength(5);
    expect(out).toEqual([red[0], red[1], red[2], red[3], ideal[2]]);
  });

  it("does not merge two absence flags that share only one anchor skill", () => {
    expect(
      flagsAreNearDuplicate("No AWS certification held", "No AWS production experience shown"),
    ).toBe(false);
  });

  it("still keeps genuinely different missing skills apart", () => {
    expect(flagsAreNearDuplicate("No Spark experience", "No Hadoop experience")).toBe(false);
    expect(
      flagsAreNearDuplicate(
        "No Terraform or IaC tooling evident",
        "No Kubernetes or container orchestration evident",
      ),
    ).toBe(false);
  });

  it("does not merge swapped-direction flags even when they share negated anchors", () => {
    expect(
      flagsAreNearDuplicate(
        "Has Terraform and IaC depth but no Kubernetes or Docker",
        "Has Kubernetes and Docker depth but no Terraform or IaC",
      ),
    ).toBe(false);
  });
});
