import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import {
  buildScopedRateLimitKey,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { createNotificationBatch } from "@/lib/services/notifications";
import { z } from "zod";

type NotesAuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

/** Mirrors auth_organisation_ids() for service-role API checks (agency includes client orgs). */
async function getAccessibleOrganisationIds(
  supabase: SupabaseClient,
  ctx: NotesAuthContext,
): Promise<string[]> {
  if (!ctx.organisationId) return [];
  if (ctx.role !== "agency") return [ctx.organisationId];
  // is_active must be honoured: deactivating a client link is expected to revoke
  // access, and nothing else in the stack enforces it.
  const { data, error } = await supabase
    .from("agency_clients")
    .select("client_organisation_id")
    .eq("agency_organisation_id", ctx.organisationId)
    .eq("is_active", true);
  if (error) {
    logger.warn("candidate notes: agency_clients lookup failed", { error: String(error) });
    return [ctx.organisationId];
  }
  const clients = (data ?? [])
    .map((r) => (r as { client_organisation_id: string }).client_organisation_id)
    .filter(Boolean);
  return [ctx.organisationId, ...clients];
}

/**
 * Candidates are not keyed by organisation_id; access matches RLS helpers (unlock or fit_score→job org).
 */
async function assertOrgAccessToCandidate(
  supabase: SupabaseClient,
  ctx: NotesAuthContext,
  candidateId: string,
): Promise<NextResponse | null> {
  if (ctx.role === "super_admin") return null;

  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .maybeSingle();

  if (candErr) {
    logger.error("candidate notes: candidate lookup failed", {
      error: String(candErr),
      candidateId,
    });
    return jsonError("Failed to verify candidate", 500);
  }
  if (!cand) return jsonError("Not found", 404);

  const orgIds = await getAccessibleOrganisationIds(supabase, ctx);
  if (orgIds.length === 0) return jsonError("Forbidden", 403);

  for (const orgId of orgIds) {
    const { data: allowed, error: rpcErr } = await supabase.rpc("can_org_access_candidate", {
      p_candidate_id: candidateId,
      p_organisation_id: orgId,
    });
    if (rpcErr) {
      logger.error("candidate notes: can_org_access_candidate failed", {
        error: String(rpcErr),
        candidateId,
        orgId,
      });
      return jsonError("Failed to verify access", 500);
    }
    if (allowed === true) return null;
  }

  return jsonError("Forbidden", 403);
}

/**
 * Job ids the caller's accessible orgs own. Notes are org-scoped only through
 * `job_id`, so every read/write must be constrained to this set — the service
 * role bypasses RLS, so the DB policy is not a backstop here.
 */
async function getAccessibleJobIds(
  supabase: SupabaseClient,
  ctx: NotesAuthContext,
): Promise<string[]> {
  const orgIds = await getAccessibleOrganisationIds(supabase, ctx);
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase.from("jobs").select("id").in("organisation_id", orgIds);
  if (error) {
    logger.error("candidate notes: accessible jobs lookup failed", { error: String(error) });
    throw new Error("accessible_jobs_lookup_failed");
  }
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/** Profile ids in the caller's accessible orgs — used to scope untagged notes. */
async function getOrgAuthorIds(supabase: SupabaseClient, ctx: NotesAuthContext): Promise<string[]> {
  const orgIds = await getAccessibleOrganisationIds(supabase, ctx);
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .in("organisation_id", orgIds);
  if (error) {
    logger.warn("candidate notes: org author lookup failed", { error: String(error) });
    return [];
  }
  return (data ?? []).map((r) => (r as { id: string }).id);
}

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const ROUTE = "/api/candidates/[id]/notes";
const MENTION_PATTERN = /@([a-z0-9._-]{2,64})/gi;

function normalizeHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function extractMentionHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) {
    if (match[1]) handles.add(normalizeHandle(match[1]));
  }
  return [...handles];
}

async function notifyMentionedUsers(params: {
  supabase: SupabaseClient;
  ctx: NotesAuthContext;
  candidateId: string;
  noteBody: string;
  noteId: string | number;
  jobId?: string | null;
}) {
  if (!params.ctx.organisationId) return;
  const mentionHandles = extractMentionHandles(params.noteBody);
  if (mentionHandles.length === 0) return;

  // `name` is not a column on profiles — naming it made PostgREST reject the
  // whole select, so mentionTargets was always empty and an @mention never
  // resolved to anyone. The reader below already treats it as optional.
  const { data: mentionTargets, error } = await params.supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organisation_id", params.ctx.organisationId);

  if (error) {
    logger.warn("candidate notes: mention target lookup failed", {
      error: String(error),
      candidateId: params.candidateId,
      noteId: params.noteId,
    });
    return;
  }

  const targetIds = (mentionTargets ?? [])
    .map((row) => {
      const profile = row as { id: string; name?: string | null; full_name?: string | null };
      const handles = new Set<string>([normalizeHandle(profile.id)]);
      if (profile.name) handles.add(normalizeHandle(profile.name));
      if (profile.full_name) handles.add(normalizeHandle(profile.full_name));
      if (handles.has(normalizeHandle(params.ctx.userId))) return null;
      for (const handle of mentionHandles) {
        if (handles.has(handle)) return profile.id;
      }
      return null;
    })
    .filter((id): id is string => Boolean(id) && id !== params.ctx.userId);
  if (targetIds.length === 0) return;

  await createNotificationBatch(targetIds, {
    type: "general",
    title: "You were mentioned in candidate notes",
    body: `A teammate mentioned you on candidate ${params.candidateId.slice(0, 8)}.`,
    link: `/recruit/candidates/${params.candidateId}`,
    metadata: {
      candidate_id: params.candidateId,
      note_id: String(params.noteId),
      job_id: params.jobId ?? "",
    },
  });
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createNoteSchema = z
  .object({
    body: z
      .string()
      .min(1, "Note body is required")
      .max(5000, "Note body must be 5000 characters or fewer"),
    jobId: z.string().uuid("Invalid job ID").optional(),
  })
  .strict();

const updateNoteSchema = z
  .object({
    noteId: z.string().regex(/^\d+$/, "Invalid note ID"),
    body: z
      .string()
      .min(1, "Note body is required")
      .max(5000, "Note body must be 5000 characters or fewer"),
  })
  .strict();

const deleteNoteSchema = z
  .object({
    noteId: z.string().regex(/^\d+$/, "Invalid note ID"),
  })
  .strict();

// ---------------------------------------------------------------------------
// GET – list notes for a candidate
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: candidateId } = await params;
    const url = new URL(request.url);
    const jobId = url.searchParams.get("job_id");
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
      100,
    );
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const supabase = createSupabaseAdmin();
    const denied = await assertOrgAccessToCandidate(supabase, ctx, candidateId);
    if (denied) return denied;

    // Org scoping: `can_org_access_candidate` above only proves the caller may see
    // the CANDIDATE — a candidate who applied to two orgs is visible to both. Notes
    // carry org identity only via job_id, so restrict to jobs the caller's orgs own
    // (plus the caller's own untagged notes). Without this, org A could read org B's
    // notes on any shared candidate.
    let accessibleJobIds: string[];
    try {
      accessibleJobIds = await getAccessibleJobIds(supabase, ctx);
    } catch {
      return jsonError("Failed to verify access", 500);
    }

    if (jobId && ctx.role !== "super_admin" && !accessibleJobIds.includes(jobId)) {
      return jsonError("Forbidden", 403);
    }

    // author_id references auth.users, not profiles — PostgREST cannot embed profiles via that FK.
    // Filters must be applied before order/range so the org scoping is part of the query.
    let query = supabase
      .from("candidate_notes")
      .select("id, candidate_id, job_id, author_id, body, created_at, updated_at")
      .eq("candidate_id", candidateId);

    if (jobId) {
      query = query.eq("job_id", jobId);
    } else if (ctx.role !== "super_admin") {
      // Untagged notes carry no job, so scope them to authors in the caller's org —
      // matching the RLS policy. Restricting to author_id = self (an earlier
      // version) silently broke teammate visibility, since the candidate-detail
      // UI never sends a jobId and therefore writes every note untagged.
      const orgAuthorIds = await getOrgAuthorIds(supabase, ctx);
      const untagged =
        orgAuthorIds.length > 0
          ? `and(job_id.is.null,author_id.in.(${orgAuthorIds.join(",")}))`
          : `and(job_id.is.null,author_id.eq.${ctx.userId})`;
      const clauses =
        accessibleJobIds.length > 0
          ? [`job_id.in.(${accessibleJobIds.join(",")})`, untagged]
          : [untagged];
      query = query.or(clauses.join(","));
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: notes, error } = await query;

    if (error) {
      logger.error("Failed to fetch candidate notes", {
        error: String(error),
        candidateId,
      });
      return jsonError("Failed to fetch notes", 500);
    }

    const rows = notes ?? [];
    const authorIds = [...new Set(rows.map((n) => n.author_id as string).filter(Boolean))];
    const nameByAuthor = new Map<string, string | null>();
    if (authorIds.length > 0) {
      // See above: `name` is not a column on profiles. With it named, this
      // select failed whole and every note rendered without its author.
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      if (profErr) {
        logger.warn("Candidate notes: could not load author names", {
          error: String(profErr),
          candidateId,
        });
      } else {
        for (const p of profs ?? []) {
          const row = p as { id: string; name?: string | null; full_name?: string | null };
          const display = row.full_name?.trim() || row.name?.trim() || null;
          nameByAuthor.set(row.id, display);
        }
      }
    }

    const notesOut = rows.map((n) => ({
      ...n,
      profiles: { name: nameByAuthor.get(n.author_id as string) ?? null },
    }));

    return jsonSuccess({ notes: notesOut });
  } catch (err) {
    return handleApiError(err, "Failed to fetch candidate notes", {
      route: `GET ${ROUTE}`,
    });
  }
}

// ---------------------------------------------------------------------------
// POST – create a new note
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    // Rate limit
    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "candidate-notes",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const { id: candidateId } = await params;

    const parsedBody = await parseJsonBody(request, "POST /api/candidates/[id]/notes");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createNoteSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i: { message: string }) => i.message);
      return jsonError(messages.join("; "), 422);
    }

    const supabase = createSupabaseAdmin();
    const deniedPost = await assertOrgAccessToCandidate(supabase, ctx, candidateId);
    if (deniedPost) return deniedPost;

    // A note tagged to a job lands in that job's hiring timeline as trusted internal
    // content — so the job must belong to the caller's orgs, or org A could inject
    // text into org B's decision record.
    if (parsed.data.jobId && ctx.role !== "super_admin") {
      let accessibleJobIds: string[];
      try {
        accessibleJobIds = await getAccessibleJobIds(supabase, ctx);
      } catch {
        return jsonError("Failed to verify access", 500);
      }
      if (!accessibleJobIds.includes(parsed.data.jobId)) {
        return jsonError("Forbidden", 403);
      }
    }

    const { data: note, error } = await supabase
      .from("candidate_notes")
      .insert({
        candidate_id: candidateId,
        job_id: parsed.data.jobId ?? null,
        author_id: ctx.userId,
        body: parsed.data.body,
      })
      .select("id, candidate_id, job_id, author_id, body, created_at, updated_at")
      .single();

    if (error) {
      logger.error("Failed to create candidate note", {
        error: String(error),
        candidateId,
      });
      return jsonError("Failed to create note", 500);
    }

    await notifyMentionedUsers({
      supabase,
      ctx,
      candidateId,
      noteBody: parsed.data.body,
      noteId: note.id,
      jobId: parsed.data.jobId ?? null,
    });

    return jsonSuccess({ note }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create candidate note", {
      route: `POST ${ROUTE}`,
    });
  }
}

// ---------------------------------------------------------------------------
// PATCH – update an existing note (author only)
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);
    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "candidate-notes-patch",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const { id: candidateId } = await params;

    const parsedBody = await parseJsonBody(request, "PATCH /api/candidates/[id]/notes");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateNoteSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i: { message: string }) => i.message);
      return jsonError(messages.join("; "), 422);
    }

    const supabase = createSupabaseAdmin();
    const deniedPatch = await assertOrgAccessToCandidate(supabase, ctx, candidateId);
    if (deniedPatch) return deniedPatch;

    // Verify ownership
    const { data: existing } = await supabase
      .from("candidate_notes")
      .select("author_id")
      .eq("id", parsed.data.noteId)
      .eq("candidate_id", candidateId)
      .single();

    if (!existing) return jsonError("Note not found", 404);
    if (existing.author_id !== ctx.userId) {
      return jsonError("Only the author can update this note", 403);
    }

    const { data: note, error } = await supabase
      .from("candidate_notes")
      .update({
        body: parsed.data.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.noteId)
      .select("id, candidate_id, job_id, author_id, body, created_at, updated_at")
      .single();

    if (error) {
      logger.error("Failed to update candidate note", {
        error: String(error),
        noteId: parsed.data.noteId,
      });
      return jsonError("Failed to update note", 500);
    }

    await notifyMentionedUsers({
      supabase,
      ctx,
      candidateId,
      noteBody: parsed.data.body,
      noteId: note.id,
      jobId: note.job_id as string | null,
    });

    return jsonSuccess({ note });
  } catch (err) {
    return handleApiError(err, "Failed to update candidate note", {
      route: `PATCH ${ROUTE}`,
    });
  }
}

// ---------------------------------------------------------------------------
// DELETE – delete a note (author only)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);
    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "candidate-notes-delete",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const { id: candidateId } = await params;

    const parsedBody = await parseJsonBody(request, "DELETE /api/candidates/[id]/notes");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = deleteNoteSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i: { message: string }) => i.message);
      return jsonError(messages.join("; "), 422);
    }

    const supabase = createSupabaseAdmin();
    const deniedDel = await assertOrgAccessToCandidate(supabase, ctx, candidateId);
    if (deniedDel) return deniedDel;

    // Verify ownership
    const { data: existing } = await supabase
      .from("candidate_notes")
      .select("author_id")
      .eq("id", parsed.data.noteId)
      .eq("candidate_id", candidateId)
      .single();

    if (!existing) return jsonError("Note not found", 404);
    if (existing.author_id !== ctx.userId) {
      return jsonError("Only the author can delete this note", 403);
    }

    const { error } = await supabase.from("candidate_notes").delete().eq("id", parsed.data.noteId);

    if (error) {
      logger.error("Failed to delete candidate note", {
        error: String(error),
        noteId: parsed.data.noteId,
      });
      return jsonError("Failed to delete note", 500);
    }

    return jsonSuccess({ deleted: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete candidate note", {
      route: `DELETE ${ROUTE}`,
    });
  }
}
