import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const adminClient = createSupabaseAdmin();
    const { data: companies, error } = await supabase
      .from("organisations")
      .select("id, name, company_plan, created_at")
      .eq("type", "company")
      .order("created_at", { ascending: false });
    if (error) return jsonError("Failed to load companies", 500);

    const ids = (companies ?? []).map((row) => row.id as string);
    const { data: mappings } = ids.length
      ? await supabase
          .from("company_sso_mappings")
          .select("company_id, primary_domain, domain_verified_at")
          .in("company_id", ids)
      : { data: [] as Record<string, unknown>[] };

    const { data: admins } = ids.length
      ? await supabase
          .from("profiles")
          .select("id, organisation_id, full_name, role")
          .in("organisation_id", ids)
          .eq("role", "leadership")
      : { data: [] as Record<string, unknown>[] };

    const { data: userCounts } = ids.length
      ? await supabase.from("profiles").select("organisation_id").in("organisation_id", ids)
      : { data: [] as Record<string, unknown>[] };

    const mappingByOrg = new Map(
      (mappings ?? []).map((row) => [String(row.company_id), row] as const),
    );
    const adminByOrg = new Map(
      (admins ?? []).map((row) => [String(row.organisation_id), row] as const),
    );
    const adminUserIds = (admins ?? [])
      .map((row) => String((row as { id?: string }).id ?? ""))
      .filter(Boolean);
    const emailByUserId = new Map<string, string>();
    if (adminUserIds.length > 0) {
      const authUsers = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const user of authUsers.data?.users ?? []) {
        if (adminUserIds.includes(user.id)) {
          emailByUserId.set(user.id, user.email ?? "");
        }
      }
    }
    const countByOrg = new Map<string, number>();
    for (const row of userCounts ?? []) {
      const orgId = String(row.organisation_id ?? "");
      if (!orgId) continue;
      countByOrg.set(orgId, (countByOrg.get(orgId) ?? 0) + 1);
    }

    const rows = (companies ?? []).map((company) => {
      const mapping = mappingByOrg.get(String(company.id));
      const admin = adminByOrg.get(String(company.id));
      return {
        id: company.id,
        name: company.name,
        plan: company.company_plan ?? "starter",
        domain: mapping?.primary_domain ?? null,
        domain_verified_at: mapping?.domain_verified_at ?? null,
        admin_name: admin?.full_name ?? null,
        admin_email: admin
          ? (emailByUserId.get(String((admin as { id?: string }).id ?? "")) ?? null)
          : null,
        created_at: company.created_at,
        user_count: countByOrg.get(String(company.id)) ?? 0,
      };
    });

    return jsonSuccess({ companies: rows });
  } catch (error) {
    return handleApiError(error, "Failed to fetch companies", {
      route: "GET /api/platform/companies",
    });
  }
}
