import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("company_sso_mappings RLS migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260418195000_company_sso_mappings.sql"),
    "utf8",
  );

  it("enforces cross-tenant isolation for select", () => {
    expect(migration).toContain('create policy "company sso mappings select"');
    expect(migration).toContain("p.organisation_id = company_sso_mappings.company_id");
    expect(migration).toContain("p.is_platform_admin = true");
  });

  it("allows platform admin to read all mappings", () => {
    expect(migration).toContain("company sso mappings select");
  });

  it("prevents regular users from writing mappings", () => {
    expect(migration).toContain("platform admins manage company sso mappings");
  });
});
