// @vitest-environment node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preview = "htdyomyhkvhcwoeodwas";
const key = (ref: string, role: string) =>
  `test.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.fixture`;
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${preview}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: key(preview, "anon"),
  SUPABASE_SERVICE_ROLE_KEY: key(preview, "service_role"),
};
function check(overrides: Record<string, string> = {}) {
  return execFileSync(process.execPath, [resolve("scripts/assert-ci-preview.mjs")], {
    env: { ...valid, ...overrides },
    encoding: "utf8",
    stdio: "pipe",
  });
}
describe("CI preview database guard", () => {
  it("accepts matching preview configuration", () => {
    expect(check()).toContain("(preview)");
  });
  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: "https://qzhhhsvtyqyixpcdfhng.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${preview}.supabase.co.attacker.invalid` },
    { SUPABASE_SERVICE_ROLE_KEY: key("qzhhhsvtyqyixpcdfhng", "service_role") },
    { SUPABASE_SERVICE_ROLE_KEY: key(preview, "anon") },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  ])("rejects unsafe or incomplete configuration: %j", (overrides) => {
    expect(() => check(overrides)).toThrow();
  });
});
