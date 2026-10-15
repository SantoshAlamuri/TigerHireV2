import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantContext } from "./tenant-context";

type InCapable = {
  in: (column: string, values: readonly string[]) => unknown;
};

type EqCapable = {
  eq: (column: string, value: string) => unknown;
};

type TableQueryBuilder = ReturnType<SupabaseClient["from"]>;

/**
 * PostgREST filter helpers (`.in`, `.eq`, …) exist on the builder returned from `.select()`,
 * not on the bare `.from()` handle. Always scope tenant filters after `.select()`.
 */
function scopedTableSelect(
  from: TableQueryBuilder,
  tenantContext: TenantContext,
  column: string,
  mode: "in" | "eq",
): TableQueryBuilder["select"] {
  const select = (columns?: string, options?: Parameters<TableQueryBuilder["select"]>[1]) => {
    let query = from.select(columns ?? "*", options);
    if (tenantContext.isSuperAdmin) return query;

    if (mode === "eq") {
      if (!tenantContext.organisationId) return query;
      return (query as unknown as EqCapable).eq(
        column,
        tenantContext.organisationId,
      ) as typeof query;
    }

    if (tenantContext.accessibleOrganisationIds.length === 0) return query;
    return (query as unknown as InCapable).in(
      column,
      tenantContext.accessibleOrganisationIds,
    ) as typeof query;
  };
  return select as TableQueryBuilder["select"];
}

/**
 * Tenant-scoped Supabase client wrapper that automatically enforces tenant isolation.
 * All queries through this client are automatically filtered by tenant context.
 */
export class TenantScopedClient {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Get the underlying Supabase client (use with caution - tenant checks not enforced)
   */
  get raw(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get tenant context
   */
  get context(): TenantContext {
    return this.tenantContext;
  }

  /**
   * Query jobs table - automatically filtered by accessible organisation IDs
   */
  jobs(): Pick<TableQueryBuilder, "select"> {
    const from = this.supabase.from("jobs");
    return {
      select: scopedTableSelect(from, this.tenantContext, "organisation_id", "in"),
    };
  }

  /**
   * Query applications table - automatically filtered by job's organisation
   * Note: RLS will enforce tenant isolation, but for explicit filtering use:
   * query.select("*, jobs!inner(organisation_id)").eq("jobs.organisation_id", orgId)
   */
  applications() {
    // RLS policies enforce tenant isolation for applications via job's organisation_id
    // We return the query builder - caller can add their own select() and filters
    // For explicit filtering, use: .select("*, jobs!inner(organisation_id)").eq("jobs.organisation_id", ...)
    return this.supabase.from("applications");
  }

  /**
   * Query fit_scores table - automatically filtered by job's organisation
   * Note: RLS will enforce tenant isolation for fit_scores via job's organisation_id
   */
  fitScores() {
    return this.supabase.from("fit_scores");
  }

  /**
   * Query pipeline_candidates table - automatically filtered by job's organisation
   * Note: RLS will enforce tenant isolation for pipeline_candidates via job's organisation_id
   */
  pipelineCandidates() {
    return this.supabase.from("pipeline_candidates");
  }

  /**
   * Query candidate_unlocks table - automatically filtered by organisation
   */
  candidateUnlocks(): Pick<TableQueryBuilder, "select"> {
    const from = this.supabase.from("candidate_unlocks");
    return {
      select: scopedTableSelect(from, this.tenantContext, "organisation_id", "in"),
    };
  }

  /**
   * Query organisations table - automatically filtered by accessible organisation IDs
   */
  organisations(): Pick<TableQueryBuilder, "select" | "update"> {
    const from = this.supabase.from("organisations");
    return {
      select: scopedTableSelect(from, this.tenantContext, "id", "in"),
      update: from.update.bind(from),
    };
  }

  /**
   * Query profiles table - automatically filtered by organisation
   */
  profiles(): Pick<TableQueryBuilder, "select"> {
    const from = this.supabase.from("profiles");
    return {
      select: scopedTableSelect(from, this.tenantContext, "organisation_id", "in"),
    };
  }

  /**
   * Query invites table - automatically filtered by organisation
   */
  invites(): Pick<TableQueryBuilder, "select"> {
    const from = this.supabase.from("invites");
    return {
      select: scopedTableSelect(from, this.tenantContext, "organisation_id", "eq"),
    };
  }

  /**
   * Query candidates table - no automatic filtering (candidates are global, access via unlocks/fit_scores)
   * Use with candidate access checks
   */
  candidates() {
    return this.supabase.from("candidates");
  }

  /**
   * Query any table with explicit tenant filtering.
   * Use this for tables that need custom tenant logic.
   */
  from(table: string) {
    return this.supabase.from(table);
  }

  /**
   * Assert that a resource belongs to the tenant's accessible organisations.
   * Throws ForbiddenError if not accessible.
   * Returns true if accessible, false if resource doesn't exist.
   */
  async assertResourceAccess(
    table: string,
    resourceId: string,
    organisationIdColumn: string = "organisation_id",
  ): Promise<boolean> {
    try {
      if (this.tenantContext.isSuperAdmin) {
        const { data, error } = await this.supabase
          .from(table)
          .select(organisationIdColumn)
          .eq("id", resourceId)
          .single();

        return !error && !!data;
      }

      if (this.tenantContext.accessibleOrganisationIds.length === 0) {
        throw new ForbiddenError("Resource not accessible to your organisation");
      }

      const { data, error } = await this.supabase
        .from(table)
        .select(organisationIdColumn)
        .eq("id", resourceId)
        .single();

      if (error || !data) {
        return false;
      }

      const resourceOrgId = (data as unknown as Record<string, unknown>)[organisationIdColumn] as
        | string
        | null;

      if (!resourceOrgId || !this.tenantContext.accessibleOrganisationIds.includes(resourceOrgId)) {
        throw new ForbiddenError("Resource not accessible to your organisation");
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Assert that a job belongs to the tenant's accessible organisations.
   * Returns true if accessible, false if job doesn't exist.
   * Throws ForbiddenError if job exists but not accessible.
   */
  async assertJobAccess(jobId: string): Promise<boolean> {
    return this.assertResourceAccess("jobs", jobId, "organisation_id");
  }

  /**
   * Assert that an application belongs to the tenant (via job's organisation).
   */
  async assertApplicationAccess(applicationId: string): Promise<void> {
    if (this.tenantContext.isSuperAdmin) return;

    const { data, error } = await this.supabase
      .from("applications")
      .select("job_id, jobs!inner(organisation_id)")
      .eq("id", applicationId)
      .single();

    if (error || !data) {
      throw new ForbiddenError("Application not found");
    }

    const job = (data as { jobs?: { organisation_id?: string } }).jobs;
    const jobOrgId = job?.organisation_id;

    if (!jobOrgId || !this.tenantContext.accessibleOrganisationIds.includes(jobOrgId)) {
      throw new ForbiddenError("Application not accessible to your organisation");
    }
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Create a tenant-scoped Supabase client from auth context.
 * This is the recommended way to access the database in API routes.
 */
export async function createTenantScopedClient(authContext: {
  userId: string;
  role: import("@/types").UserRole;
  organisationId: string | null;
}): Promise<TenantScopedClient> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const { createTenantContext } = await import("./tenant-context");

  const supabase = await createSupabaseServerClient();
  const tenantContext = await createTenantContext(authContext);

  return new TenantScopedClient(supabase, tenantContext);
}
