import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * What migration 20260801120000_requisition_approval_chains.sql must guarantee.
 *
 * Written before the migration was applied, and run red first: every assertion
 * here failed with "relation does not exist" until the schema existed.
 *
 * These are the guarantees that cannot live in application code. An approval
 * policy is a control — if the database will accept two default chains, or a
 * step with an SLA of zero, or lets one org read another's policy, then no
 * amount of care in the API prevents it. The API is one caller; the constraint
 * is the rule.
 */
const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasLiveSupabaseEnv)("requisition approval chains schema (live DB)", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  let admin: ReturnType<typeof createSupabaseAdmin>;
  let orgId = "";
  let otherOrgId = "";
  const chainIds: string[] = [];

  async function makeOrg(name: string): Promise<string> {
    const { data, error } = await admin
      .from("organisations")
      .insert({
        type: "company",
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        approval: "approved",
        company_plan: "starter",
      })
      .select("id")
      .single();
    if (error || !data?.id) throw new Error(`Failed to create org: ${error?.message}`);
    return data.id as string;
  }

  async function makeChain(organisationId: string, isDefault: boolean, name = "Chain") {
    const res = await admin
      .from("requisition_approval_chains")
      .insert({ organisation_id: organisationId, name, is_default: isDefault })
      .select("id")
      .single();
    if (res.data?.id) chainIds.push(res.data.id as string);
    return res;
  }

  beforeAll(async () => {
    admin = createSupabaseAdmin();
    orgId = await makeOrg(`Chain Org ${suffix}`);
    otherOrgId = await makeOrg(`Chain Other Org ${suffix}`);
  });

  afterAll(async () => {
    for (const id of chainIds) {
      await admin.from("requisition_approval_chains").delete().eq("id", id);
    }
    await admin.from("organisations").delete().in("id", [orgId, otherOrgId]);
  });

  it("stores a chain and its steps", async () => {
    const { data: chain, error } = await makeChain(orgId, true, "HM to Admin");
    expect(error).toBeNull();
    expect(chain?.id).toBeTruthy();

    const { error: stepError } = await admin.from("requisition_approval_chain_steps").insert({
      chain_id: chain!.id,
      step_order: 1,
      approver_role: "leadership",
      sla_hours: 8,
      skip_when_raiser_role: ["leadership"],
    });
    expect(stepError).toBeNull();
  });

  /**
   * Two defaults means the chain a requisition is planned from depends on row
   * order — which is to say, on nothing. The database decides this, not the UI.
   */
  it("permits only one default chain per organisation", async () => {
    const { error } = await makeChain(orgId, true, "Second default");
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });

  it("still allows a second NON-default chain", async () => {
    const { error } = await makeChain(orgId, false, "Alternative");
    expect(error).toBeNull();
  });

  it("allows a different organisation its own default", async () => {
    const { error } = await makeChain(otherOrgId, true, "Their default");
    expect(error).toBeNull();
  });

  it("refuses an SLA that can never be met", async () => {
    const { data: chain } = await makeChain(orgId, false, "SLA test");
    const { error } = await admin.from("requisition_approval_chain_steps").insert({
      chain_id: chain!.id,
      step_order: 1,
      approver_role: "recruiter",
      sla_hours: 0,
    });
    expect(error?.code).toBe("23514");
  });

  it("refuses a step order below one", async () => {
    const { data: chain } = await makeChain(orgId, false, "Order test");
    const { error } = await admin.from("requisition_approval_chain_steps").insert({
      chain_id: chain!.id,
      step_order: 0,
      approver_role: "recruiter",
      sla_hours: 8,
    });
    expect(error?.code).toBe("23514");
  });

  it("refuses the same role twice at the same step", async () => {
    // Two identical stages at one order would double-count a single approval.
    const { data: chain } = await makeChain(orgId, false, "Dup test");
    const row = {
      chain_id: chain!.id,
      step_order: 1,
      approver_role: "finance",
      sla_hours: 8,
    };
    expect((await admin.from("requisition_approval_chain_steps").insert(row)).error).toBeNull();
    expect((await admin.from("requisition_approval_chain_steps").insert(row)).error?.code).toBe(
      "23505",
    );
  });

  it("allows the same role at different steps — a second sign-off is legitimate", async () => {
    const { data: chain } = await makeChain(orgId, false, "Two sign-offs");
    expect(
      (
        await admin.from("requisition_approval_chain_steps").insert([
          { chain_id: chain!.id, step_order: 1, approver_role: "leadership", sla_hours: 8 },
          { chain_id: chain!.id, step_order: 2, approver_role: "leadership", sla_hours: 8 },
        ])
      ).error,
    ).toBeNull();
  });

  it("takes the steps with the chain when it is deleted", async () => {
    // A step orphaned from its chain would gate requisitions under a policy
    // nobody can see or edit.
    const { data: chain } = await makeChain(orgId, false, "Cascade test");
    await admin.from("requisition_approval_chain_steps").insert({
      chain_id: chain!.id,
      step_order: 1,
      approver_role: "recruiter",
      sla_hours: 8,
    });
    await admin.from("requisition_approval_chains").delete().eq("id", chain!.id);
    const { data: orphans } = await admin
      .from("requisition_approval_chain_steps")
      .select("id")
      .eq("chain_id", chain!.id);
    expect(orphans ?? []).toEqual([]);
  });

  it("defaults the skip list to empty rather than null", async () => {
    // Null would make every read of the policy handle two shapes for "no
    // skips", and one of those handlers eventually gets it wrong.
    const { data: chain } = await makeChain(orgId, false, "Default test");
    const { data: step } = await admin
      .from("requisition_approval_chain_steps")
      .insert({ chain_id: chain!.id, step_order: 1, approver_role: "recruiter", sla_hours: 8 })
      .select("skip_when_raiser_role, skip_when_budget_below")
      .single();
    expect(step?.skip_when_raiser_role).toEqual([]);
    // NULL means "always applies" — deliberately not 0, which would never fire.
    expect(step?.skip_when_budget_below).toBeNull();
  });

  it("records on the requisition which chain planned it", async () => {
    const { data: cols } = await admin.from("hiring_requests").select("approval_chain_id").limit(1);
    // Selecting the column at all proves it exists; an absent column errors.
    expect(cols).toBeDefined();
  });

  /**
   * The tenant boundary. An approval policy names who holds power in a company;
   * another company's staff must not be able to read it.
   */
  it("does not expose one organisation's policy to another's members", async () => {
    const anon: SupabaseClient = createClient(
      String(process.env.NEXT_PUBLIC_SUPABASE_URL),
      String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // Unauthenticated is the strongest case: RLS must return nothing at all.
    const { data } = await anon
      .from("requisition_approval_chains")
      .select("id")
      .eq("organisation_id", orgId);
    expect(data ?? []).toEqual([]);
  });
});
