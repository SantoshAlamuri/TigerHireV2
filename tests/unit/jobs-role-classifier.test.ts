import { describe, expect, it } from "vitest";
import { classifyRoleKeywordFirst } from "@/lib/jobs/role-classifier";
import { buildDedupFingerprint, choosePreferredRecord } from "@/lib/jobs/sync/dedup";

describe("classifyRoleKeywordFirst", () => {
  it("uses title hits first", () => {
    const role = classifyRoleKeywordFirst(
      "Senior Backend Engineer - Node.js",
      "Build APIs, distributed systems and infrastructure",
    );
    expect(role).toBe("backend");
  });

  it("falls back to description hits when title is generic", () => {
    const role = classifyRoleKeywordFirst(
      "Software Engineer",
      "Looking for strong machine learning and data engineer experience with mlops.",
    );
    expect(role).toBe("data_ml");
  });

  it("returns null when confidence is low", () => {
    const role = classifyRoleKeywordFirst(
      "Associate",
      "Generalist role with cross-functional collaboration.",
    );
    expect(role).toBeNull();
  });
});

describe("dedup helpers", () => {
  it("creates deterministic fingerprint", () => {
    const first = buildDedupFingerprint({
      title: "Backend Engineer",
      company: "Acme",
      city: "bangalore",
      description: "Node.js APIs and Postgres",
    });
    const second = buildDedupFingerprint({
      title: "backend engineer",
      company: "ACME",
      city: "bangalore",
      description: "Node.js APIs and Postgres!",
    });
    expect(first).toBe(second);
  });

  it("prefers newest post then source priority", () => {
    const preferred = choosePreferredRecord([
      { id: "a", source: "jsearch", posted_at: "2026-01-10T00:00:00.000Z" },
      { id: "b", source: "greenhouse", posted_at: "2026-01-10T00:00:00.000Z" },
      { id: "c", source: "lever", posted_at: "2026-01-09T00:00:00.000Z" },
    ]);
    expect(preferred.id).toBe("b");
  });
});
