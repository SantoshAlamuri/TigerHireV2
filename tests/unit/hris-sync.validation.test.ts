import { describe, expect, it } from "vitest";
import { listHrisSyncRunsSchema, runHrisSyncSchema } from "@/lib/validations/hris-sync";

describe("hris sync validation", () => {
  it("accepts run payload for supported HRIS provider", () => {
    const parsed = runHrisSyncSchema.safeParse({
      provider: "keka",
      mode: "dry_run",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported provider", () => {
    const parsed = runHrisSyncSchema.safeParse({
      provider: "sap_successfactors",
      mode: "dry_run",
    });
    expect(parsed.success).toBe(false);
  });

  it("coerces and limits list payload correctly", () => {
    const parsed = listHrisSyncRunsSchema.safeParse({
      provider: "workday",
      limit: "25",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(25);
  });
});
