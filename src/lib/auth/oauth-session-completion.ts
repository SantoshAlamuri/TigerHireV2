import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ROLE_DASHBOARD_PATH } from "@/types";
import type { UserRole } from "@/types";
import { logger } from "@/lib/observability/logger";
import { createNotificationBatch } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/services/resend";
import { extractDomain, resolveOauthCompanyFromEmail } from "@/lib/sso/domain";
import { claimUnclaimedCandidateByEmail } from "@/lib/agents/candidate-dedup";
import {
  isPasswordAuthProvider,
  shouldEnforceCompanySsoForProfile,
} from "@/lib/security/company-sso-enforcement";

/** Derive a company display name from an email domain, e.g. laundryheap.com -> "Laundryheap". */
function deriveOrgNameFromDomain(domain: string): string {
  const label = (domain.split(".")[0] ?? "").replace(/[-_]+/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Company";
}

type AuditLogInsert = {
  organisation_id: string;
  actor_user_id: string;
  actor_email: string | null;
  event_type: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

async function insertAuthAuditLog(entry: AuditLogInsert) {
  try {
    const admin = createSupabaseAdmin();
    await admin.from("audit_log").insert({
      organisation_id: entry.organisation_id,
      actor_user_id: entry.actor_user_id,
      actor_email: entry.actor_email,
      event_type: entry.event_type,
      resource_type: entry.resource_type ?? "auth",
      resource_id: entry.resource_id ?? entry.actor_user_id,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    logger.warn("Auth callback audit log write failed", {
      eventType: entry.event_type,
      organisationId: entry.organisation_id,
      userId: entry.actor_user_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getEmailFromOAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const emailCandidates = [
    typeof user.email === "string" ? user.email : null,
    typeof metadata.email === "string" ? metadata.email : null,
    typeof metadata.preferred_username === "string" ? metadata.preferred_username : null,
    typeof metadata.upn === "string" ? metadata.upn : null,
  ].filter(Boolean) as string[];

  for (const value of emailCandidates) {
    if (value.includes("@")) return value.trim().toLowerCase();
  }
  return null;
}

async function notifyCompanyAdminsPendingAccess(params: {
  companyId: string;
  pendingUserId: string;
  pendingEmail: string;
}) {
  const admin = createSupabaseAdmin();
  const { data: admins, error: adminsError } = await admin
    .from("profiles")
    .select("id")
    .eq("organisation_id", params.companyId)
    .eq("role", "leadership")
    .eq("role_status", "active")
    .eq("is_active", true);
  if (adminsError || !admins?.length) return;

  const adminIds = admins.map((row) => String(row.id)).filter(Boolean);
  if (!adminIds.length) return;

  await createNotificationBatch(adminIds, {
    type: "general",
    title: "New SSO user pending approval",
    body: `${params.pendingEmail} signed in with SSO and needs role assignment.`,
    link: "/company/settings/permissions",
    metadata: {
      pending_user_id: params.pendingUserId,
      pending_email: params.pendingEmail,
    },
  });

  const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = authUsers.data?.users ?? [];
  const adminEmails = users
    .filter((user) => adminIds.includes(user.id))
    .map((user) => user.email)
    .filter((email): email is string => Boolean(email));
  if (!adminEmails.length) return;

  await Promise.allSettled(
    adminEmails.map((to) =>
      sendEmail({
        to,
        subject: "TigerHire: SSO user pending approval",
        html: `<p>${params.pendingEmail} signed in with your company SSO domain and is pending approval.</p><p>Review in Company settings &gt; Permissions.</p>`,
      }),
    ),
  );
}

export async function ensurePublicOauthProfile(params: {
  userId: string;
  email: string;
  fullName: string;
}): Promise<{ role: UserRole; organisationId: string | null }> {
  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("profiles")
    .select("role, organisation_id")
    .eq("id", params.userId)
    .maybeSingle();

  if (existing?.role) {
    const existingRole = existing.role as UserRole;
    const existingOrgId = (existing.organisation_id as string | null | undefined) ?? null;
    const isCandidateRole = existingRole === "candidate_free" || existingRole === "candidate_pro";
    if (!isCandidateRole && existingOrgId) {
      throw new Error("Existing enterprise profile cannot use public OAuth fallback");
    }
    await claimUnclaimedCandidateByEmail(admin, params.userId, params.email);
    return {
      role: existingRole,
      organisationId: existingOrgId,
    };
  }

  const { error: insertError } = await admin.from("profiles").insert({
    id: params.userId,
    role: "candidate_free",
    full_name: params.fullName,
  });
  if (insertError) throw insertError;

  await claimUnclaimedCandidateByEmail(admin, params.userId, params.email);
  return { role: "candidate_free", organisationId: null };
}

type InviteProvisionResult = {
  action: "invite_linked" | "existing" | "no_invite";
  role: UserRole | null;
  roleStatus: string;
  organisationId: string | null;
};

/**
 * Consume a pending invite matched by proven-owned email alone (any org), for OAuth
 * users whose company domain is not SSO-verified. Without this an invited user on a
 * non-SSO company domain authenticates but never gets a profile and loops on redirect.
 *
 * Returns action "invite_linked" only when a fresh invite was consumed; "existing"
 * (already-roled profile) and "no_invite" both mean the caller should fall through to
 * its normal, non-invite handling. Never overrides an already-roled profile.
 */
export async function provisionOauthProfileFromPendingInvite(params: {
  userId: string;
  email: string;
  fullName: string;
}): Promise<InviteProvisionResult> {
  const admin = createSupabaseAdmin();
  const { data: rows, error } = await admin.rpc("oauth_provision_profile_from_invite", {
    p_user_id: params.userId,
    p_email: params.email,
    p_full_name: params.fullName,
  });
  if (error) {
    logger.error("OAuth invite fallback provisioning failed", {
      error: error.message,
      userId: params.userId,
    });
    return { action: "no_invite", role: null, roleStatus: "pending", organisationId: null };
  }
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : null;
  const action = String(row?.action ?? "no_invite");
  return {
    action:
      action === "invite_linked"
        ? "invite_linked"
        : action === "existing"
          ? "existing"
          : "no_invite",
    role: (row?.role as UserRole | null) ?? null,
    roleStatus: String(row?.role_status ?? (action === "invite_linked" ? "active" : "pending")),
    organisationId: (row?.organisation_id as string | null) ?? null,
  };
}

/**
 * After Supabase has a user session (code exchange or signInWithIdToken), run the same
 * org resolution + provisioning + dashboard redirect.
 */
export async function completeOAuthSessionRedirect(params: {
  supabase: SupabaseClient;
  user: User;
  next: string;
  isPublicOauthFlow: boolean;
  origin: string;
}): Promise<NextResponse> {
  const { supabase, user, next, isPublicOauthFlow, origin } = params;
  const noAccessPath = (reason: string, options?: { domain?: string }) => {
    const query = new URLSearchParams({ reason });
    if (options?.domain) query.set("domain", options.domain);
    if (next && next !== "/") query.set("next", next);
    return `/auth/no-access?${query.toString()}`;
  };

  const email = getEmailFromOAuthUser(user);
  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("email_missing"), origin));
  }

  const userMeta = user.user_metadata ?? {};
  const fullName =
    (typeof userMeta.full_name === "string" && userMeta.full_name.trim()) ||
    (typeof userMeta.name === "string" && userMeta.name.trim()) ||
    email.split("@")[0];
  const authProvider = (user.app_metadata?.provider as string | undefined) ?? null;
  const emailVerified =
    Boolean(user.email_confirmed_at) ||
    (user.user_metadata as Record<string, unknown> | undefined)?.email_verified === true;

  // Shared "we resolved a role for this user, now route them" tail. Used by both the
  // SSO-verified RPC path and the email-invite fallback path so their post-provision
  // handling (audit, pending/suspended gates, SSO enforcement, dashboard) stays identical.
  const finalizeAuthenticatedRedirect = async (finalize: {
    role: UserRole | null;
    roleStatus: string;
    organisationId: string;
    action: string;
  }): Promise<NextResponse> => {
    const { role, roleStatus, organisationId, action } = finalize;

    await insertAuthAuditLog({
      organisation_id: organisationId,
      actor_user_id: user.id,
      actor_email: email,
      event_type: "auth.oauth.login_success",
      metadata: {
        provider: authProvider ?? "unknown",
        domain: extractDomain(email),
        action,
        role_status: roleStatus,
        role: role ?? null,
      },
    });

    if (roleStatus === "pending") {
      await notifyCompanyAdminsPendingAccess({
        companyId: organisationId,
        pendingUserId: user.id,
        pendingEmail: email,
      });
      return NextResponse.redirect(new URL("/awaiting-approval", origin));
    }

    if (roleStatus === "suspended") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(noAccessPath("account_suspended"), origin));
    }

    if (!role) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(noAccessPath("role_missing"), origin));
    }

    const enforceCompanySso = await shouldEnforceCompanySsoForProfile({ role, organisationId });
    if (enforceCompanySso && isPasswordAuthProvider(authProvider)) {
      await supabase.auth.signOut();
      logger.warn("Blocked callback session because organisation requires SSO", {
        route: "oauthSessionCompletion",
        userId: user.id,
        role,
        organisationId,
        authProvider,
      });
      return NextResponse.redirect(new URL("/login?error=sso_required", origin));
    }

    const dashboardPath = next && next !== "/" ? next : (ROLE_DASHBOARD_PATH[role] ?? "/");
    return NextResponse.redirect(new URL(dashboardPath, origin));
  };

  if (isPublicOauthFlow) {
    try {
      const publicProfile = await ensurePublicOauthProfile({
        userId: user.id,
        email,
        fullName,
      });
      const dashboardPath =
        next && next !== "/" ? next : (ROLE_DASHBOARD_PATH[publicProfile.role] ?? "/candidate");
      return NextResponse.redirect(new URL(dashboardPath, origin));
    } catch (error) {
      logger.error("Public OAuth profile provisioning failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      });
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(noAccessPath("provisioning_failed"), origin));
    }
  }

  // ── Employer (company-mode) SSO flow ──────────────────────────────────────────
  // Candidate sign-ins already returned above (isPublicOauthFlow). Reaching here means
  // company mode. The model:
  //   invited                       → their invited role (any domain state)
  //   returning (already has role)  → route
  //   personal/public email         → "use your work email"
  //   domain already a company      → "ask your admin to add you"
  //   business domain, no company   → auto-create the company, they become admin
  const resolution = await resolveOauthCompanyFromEmail(email);
  const domain = resolution.domain || extractDomain(email);

  if (resolution.reason === "invalid_domain") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("invalid_domain", { domain }), origin));
  }

  // Invited or returning users get in first — regardless of the domain's company state.
  if (emailVerified) {
    const invite = await provisionOauthProfileFromPendingInvite({
      userId: user.id,
      email,
      fullName,
    });
    if (invite.action === "invite_linked" && invite.role && invite.organisationId) {
      return finalizeAuthenticatedRedirect({
        role: invite.role,
        roleStatus: invite.roleStatus,
        organisationId: invite.organisationId,
        action: "invite_linked",
      });
    }
    if (invite.action === "existing" && invite.role) {
      return finalizeAuthenticatedRedirect({
        role: invite.role,
        roleStatus: invite.roleStatus,
        organisationId: invite.organisationId ?? "",
        action: "existing",
      });
    }
  }

  // Employer who chose company mode but signed in with a personal/free email address.
  if (resolution.reason === "public_domain_blocked") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("work_email_required", { domain }), origin));
  }

  // Uninvited, and this domain already belongs to a company on TigerHire → ask their admin.
  if (resolution.companyId) {
    await notifyCompanyAdminsPendingAccess({
      companyId: resolution.companyId,
      pendingUserId: user.id,
      pendingEmail: email,
    }).catch((error) => {
      logger.warn("pending_access_admin_notify_failed", {
        companyId: resolution.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    await insertAuthAuditLog({
      organisation_id: resolution.companyId,
      actor_user_id: user.id,
      actor_email: email,
      event_type: "auth.oauth.ask_admin",
      metadata: { provider: authProvider ?? "unknown", domain },
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("ask_admin", { domain }), origin));
  }

  // Business domain that no company has claimed → auto-create the company (active), make
  // them its admin. Requires a verified email so a company isn't created off an unverified one.
  if (!emailVerified) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("provisioning_failed", { domain }), origin));
  }
  const providerType =
    authProvider === "azure"
      ? "oauth_microsoft"
      : authProvider === "google"
        ? "oauth_google"
        : "oauth_google";
  const admin = createSupabaseAdmin();
  const { data: createdRows, error: createError } = await admin.rpc(
    "oauth_create_employer_org_from_domain",
    {
      p_user_id: user.id,
      p_email: email,
      p_full_name: fullName,
      p_org_name: deriveOrgNameFromDomain(domain),
      p_domain: domain,
      p_provider_type: providerType,
    },
  );
  const created = Array.isArray(createdRows) ? createdRows[0] : null;
  if (createError || !created) {
    logger.error("Employer org auto-create failed", {
      error: createError?.message ?? "Missing create result",
      userId: user.id,
      domain,
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("provisioning_failed", { domain }), origin));
  }

  // Race: another sign-in claimed this domain between resolve and create → ask their admin.
  if (created.action === "exists") {
    if (created.organisation_id) {
      await notifyCompanyAdminsPendingAccess({
        companyId: String(created.organisation_id),
        pendingUserId: user.id,
        pendingEmail: email,
      }).catch((error) => {
        logger.warn("pending_access_admin_notify_failed", {
          companyId: String(created.organisation_id),
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(noAccessPath("ask_admin", { domain }), origin));
  }

  return finalizeAuthenticatedRedirect({
    role: (created.role as UserRole | null) ?? "leadership",
    roleStatus: "active",
    organisationId: String(created.organisation_id ?? ""),
    action: String(created.action ?? "created"),
  });
}
