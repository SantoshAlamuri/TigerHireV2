import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { getVercelEnv } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";

/**
 * POST /api/auth/seed-demo-users
 * Creates or resets demo Auth users and profiles so test accounts can log in.
 * Allowed only in development or when X-Seed-Demo-Secret header matches SEED_DEMO_SECRET.
 */
const DEMO_DEV_PASSWORD = "demo123";

function getSeedPassword(): string | null {
  if (process.env.SEED_DEMO_PASSWORD) return process.env.SEED_DEMO_PASSWORD;
  if (process.env.NODE_ENV === "development") return DEMO_DEV_PASSWORD;
  return null;
}
const DEMO_USERS = [
  {
    email: "sam@tigerhire.io",
    role: "super_admin" as const,
    fullName: "Sam (Super Admin)",
    orgName: null,
  },
  {
    email: "nidhi.gupta@finstack.in",
    role: "leadership" as const,
    fullName: "Nidhi Gupta",
    orgName: "Finstack",
  },
  {
    email: "rajiv.menon@finstack.in",
    role: "recruiter" as const,
    fullName: "Rajiv Menon",
    orgName: "Finstack",
  },
  {
    email: "kavita.rao@finstack.in",
    role: "hiring_manager" as const,
    fullName: "Kavita Rao",
    orgName: "Finstack",
  },
  {
    email: "meera.nair@finstack.in",
    role: "employee" as const,
    fullName: "Meera Nair",
    orgName: "Finstack",
  },
  {
    email: "lakshmi.interviewer@finstack.in",
    role: "interviewer" as const,
    fullName: "Lakshmi Interviewer",
    orgName: "Finstack",
  },
  {
    email: "lakshmi.finance@finstack.in",
    role: "finance" as const,
    fullName: "Lakshmi Finance",
    orgName: "Finstack",
  },
  {
    email: "fatima.sheikh@talentbridge.co",
    role: "agency" as const,
    fullName: "Fatima Sheikh",
    orgName: "TalentBridge",
  },
  {
    email: "priya.sharma@gmail.com",
    role: "candidate_pro" as const,
    fullName: "Priya Sharma",
    orgName: null,
  },
  {
    email: "siddharth.patil@outlook.com",
    role: "candidate_free" as const,
    fullName: "Siddharth Patil",
    orgName: null,
  },
];
const PLATFORM_ADMIN_TEST_EMAILS = new Set(["sam@tigerhire.io", "admin@tigerhire.com"]);

function isSeedAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const secret = request.headers.get("x-seed-demo-secret");
  if (process.env.SEED_DEMO_SECRET && secret === process.env.SEED_DEMO_SECRET) return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (getVercelEnv() === "production") {
    return jsonError("Not available", 404);
  }
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  if (!isSeedAllowed(request)) {
    return jsonError("Not available", 404);
  }
  const password = getSeedPassword();
  if (!password) {
    logger.error("Seed-demo: SEED_DEMO_PASSWORD not set");
    return jsonError("Demo seed not configured. Set SEED_DEMO_PASSWORD.", 503);
  }

  const admin = createSupabaseAdmin();

  try {
    const {
      data: { users: existingUsers },
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUserByEmail = new Map(existingUsers.map((u) => [u.email?.toLowerCase(), u]));

    for (const demo of DEMO_USERS) {
      const email = demo.email.toLowerCase();
      const existing = authUserByEmail.get(email);

      if (existing) {
        await admin.auth.admin.updateUserById(existing.id, {
          password,
        });
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: demo.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: demo.fullName },
        });
        if (error) {
          logger.error("Seed-demo createUser failed", {
            email: demo.email,
            error: String(error),
          });
          continue;
        }
        if (created?.user) authUserByEmail.set(email, created.user);
      }
    }

    // Ensure organisations exist for company/agency demos
    const orgNames = ["Finstack", "TalentBridge"] as const;
    const orgType = {
      Finstack: "company" as const,
      TalentBridge: "agency" as const,
    };
    const orgIds: Record<string, string> = {};

    for (const name of orgNames) {
      const { data: rows } = await admin
        .from("organisations")
        .select("id")
        .eq("name", name)
        .limit(1);
      if (rows?.[0]?.id) {
        orgIds[name] = rows[0].id;
      } else {
        const { data: inserted } = await admin
          .from("organisations")
          .insert({
            type: orgType[name],
            name,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
            approval: "approved",
          })
          .select("id")
          .single();
        if (inserted?.id) orgIds[name] = inserted.id;
      }
    }

    // Ensure profiles exist with correct role and org
    for (const demo of DEMO_USERS) {
      const authUser = authUserByEmail.get(demo.email.toLowerCase());
      if (!authUser) continue;
      const email = demo.email.toLowerCase();

      const orgId = demo.orgName ? (orgIds[demo.orgName] ?? null) : null;
      const { data: profile } = await admin
        .from("profiles")
        .select("id, role, organisation_id")
        .eq("id", authUser.id)
        .single();

      const isOrgAdmin = demo.role === "leadership";
      if (profile) {
        await admin
          .from("profiles")
          .update({
            role: demo.role,
            organisation_id: orgId,
            full_name: demo.fullName,
            is_platform_admin: PLATFORM_ADMIN_TEST_EMAILS.has(email),
            is_org_admin: isOrgAdmin,
            updated_at: new Date().toISOString(),
          })
          .eq("id", authUser.id);
      } else {
        await admin.from("profiles").insert({
          id: authUser.id,
          role: demo.role,
          organisation_id: orgId,
          full_name: demo.fullName,
          is_platform_admin: PLATFORM_ADMIN_TEST_EMAILS.has(email),
          is_org_admin: isOrgAdmin,
        });
      }
    }

    // Ensure hiring manager has at least one demo JD (Finstack)
    const hmEmail = "kavita.rao@finstack.in";
    const finstackId = orgIds["Finstack"];
    const hmUser = authUserByEmail.get(hmEmail);
    if (finstackId && hmUser?.id) {
      const { data: existingJob } = await admin
        .from("jobs")
        .select("id")
        .eq("organisation_id", finstackId)
        .eq("hiring_manager_id", hmUser.id)
        .limit(1)
        .maybeSingle();
      if (!existingJob?.id) {
        await admin.from("jobs").insert({
          organisation_id: finstackId,
          created_by: hmUser.id,
          title: "Demo JD for Hiring Manager",
          description:
            "This job is assigned to the demo hiring manager so they can see it under My JDs.",
          status: "open",
          hiring_manager_id: hmUser.id,
        });
      }
    }

    return jsonSuccess({
      message: "Demo users seeded. Use SEED_DEMO_PASSWORD to sign in.",
      count: DEMO_USERS.length,
    });
  } catch (err) {
    return handleApiError(err, "Seed failed", {
      route: "POST /api/auth/seed-demo-users",
    });
  }
}
