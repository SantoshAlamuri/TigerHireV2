import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 10_000;

function parsePaginationParams(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");

  const limit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const offset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return { error: "Invalid limit: expected an integer >= 1" };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { error: "Invalid offset: expected an integer >= 0" };
  }

  return {
    limit: Math.min(limit, MAX_LIMIT),
    offset: Math.min(offset, MAX_OFFSET),
  };
}

const createConversationBodySchema = z
  .object({
    participant_ids: z.array(z.string().trim().min(1)).min(1),
    subject: z.string().trim().optional(),
    job_id: z.string().trim().optional(),
    message: z.string().trim().min(1),
  })
  .strict();

/**
 * GET /api/messages
 * List conversations for the current user with last message preview and unread counts.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const pagination = parsePaginationParams(url);
    if ("error" in pagination) {
      return jsonError(String(pagination.error), 400);
    }
    const { limit, offset } = pagination;

    const supabase = await createSupabaseServerClient();

    const { data: participations, error: partErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", ctx.userId);

    if (partErr) {
      logger.error("Failed to fetch conversation participations", { error: String(partErr) });
      return jsonError("Failed to load conversations", 500);
    }
    if (!participations?.length) {
      return jsonSuccess({
        conversations: [],
        total: 0,
        pagination: {
          limit,
          offset,
          total: 0,
          hasMore: false,
        },
      });
    }

    const convIds = participations.map((p) => p.conversation_id);
    const lastReadMap = new Map(participations.map((p) => [p.conversation_id, p.last_read_at]));

    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, job_id, organisation_id, subject, created_at, updated_at")
      .in("id", convIds)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (convErr) {
      logger.error("Failed to fetch conversations", { error: String(convErr) });
      return jsonError("Failed to fetch conversations", 500);
    }

    const results = await Promise.all(
      (conversations ?? []).map(async (conv) => {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("id, sender_id, body, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastRead = lastReadMap.get(conv.id) ?? conv.created_at;
        const { count: unreadCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", ctx.userId)
          .gt("created_at", lastRead);

        const { data: participants } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conv.id);

        return {
          ...conv,
          last_message: lastMsg
            ? {
                body: lastMsg.body,
                created_at: lastMsg.created_at,
              }
            : null,
          unread_count: unreadCount ?? 0,
          participant_ids: (participants ?? []).map((p) => p.user_id),
        };
      }),
    );

    // Resolve participant display names in two batched queries (not N+1): recruiters/
    // staff live in `profiles`, messaged candidates are linked by `candidates.user_id`.
    const allParticipantIds = [...new Set(results.flatMap((r) => r.participant_ids))].filter(
      (id): id is string => Boolean(id),
    );
    const nameById = new Map<string, string>();
    if (allParticipantIds.length > 0) {
      const [{ data: profileRows }, { data: candidateRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", allParticipantIds),
        supabase.from("candidates").select("user_id, name").in("user_id", allParticipantIds),
      ]);
      for (const p of profileRows ?? []) {
        const name = (p.full_name as string | null)?.trim();
        if (p.id && name) nameById.set(p.id as string, name);
      }
      for (const c of candidateRows ?? []) {
        const uid = c.user_id as string | null;
        const name = (c.name as string | null)?.trim();
        // Only fill when a profile name wasn't already found.
        if (uid && name && !nameById.has(uid)) nameById.set(uid, name);
      }
    }

    const resultsWithNames = results.map((r) => {
      const participants = r.participant_ids.map((id) => ({
        id,
        name: nameById.get(id) ?? "Unknown",
      }));
      const other = participants.find((p) => p.id !== ctx.userId) ?? participants[0] ?? null;
      return { ...r, participants, display_name: other?.name ?? "Unknown" };
    });

    const total = convIds.length;
    return jsonSuccess({
      conversations: resultsWithNames,
      total,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + results.length < total,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch conversations", {
      route: "GET /api/messages",
    });
  }
}

/**
 * POST /api/messages
 * Create a new conversation. Body: { participant_ids: string[], subject?: string, job_id?: string, message: string }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsed = await parseJsonBody<{
      participant_ids?: string[];
      subject?: string;
      job_id?: string;
      message?: string;
    }>(request, "POST /api/messages");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = createConversationBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const supabase = await createSupabaseServerClient();

    const allParticipants = [...new Set([ctx.userId, ...body.participant_ids])];

    // Verify all participants belong to the same organisation as the caller,
    // or are linked via a job's organisation. Prevents messaging arbitrary users.
    const otherIds = allParticipants.filter((id) => id !== ctx.userId);
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, organisation_id")
        .in("id", otherIds);

      if (!profiles || profiles.length !== otherIds.length) {
        return jsonError("One or more participants not found", 404);
      }

      const callerOrgId = ctx.organisationId;
      for (const p of profiles) {
        const sameOrg = callerOrgId && p.organisation_id === callerOrgId;
        const isCandidate = !p.organisation_id;
        if (!sameOrg && !isCandidate) {
          return jsonError(
            "You can only message users within your organisation or candidates",
            403,
          );
        }
      }
    }

    let orgId: string | null = ctx.organisationId;
    if (!orgId && body.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("organisation_id")
        .eq("id", body.job_id)
        .single();
      orgId = job?.organisation_id ?? null;
    }

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        subject: body.subject?.trim() || null,
        job_id: body.job_id || null,
        organisation_id: orgId,
      })
      .select("id, job_id, organisation_id, subject, created_at, updated_at")
      .single();

    if (convErr || !conv) {
      logger.error("Failed to create conversation", { error: String(convErr) });
      return jsonError("Failed to create conversation", 500);
    }

    const participantRows = allParticipants.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
    }));
    const { error: partInsertErr } = await supabase
      .from("conversation_participants")
      .insert(participantRows);
    if (partInsertErr) {
      logger.error("Failed to add conversation participants", { error: String(partInsertErr) });
      await supabase.from("conversations").delete().eq("id", conv.id);
      return jsonError(
        "Could not add participants. Use each person’s login account — candidate profiles without a user account cannot be messaged yet.",
        422,
      );
    }

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conv.id,
        sender_id: ctx.userId,
        body: body.message.trim(),
      })
      .select(
        "id, conversation_id, sender_id, body, attachment_url, attachment_name, created_at, edited_at",
      )
      .single();

    if (msgErr || !msg) {
      logger.error("Failed to send initial message", { error: String(msgErr) });
      await supabase.from("conversations").delete().eq("id", conv.id);
      return jsonError("Failed to send the first message. Please try again.", 500);
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conv.id);

    return jsonSuccess({ conversation: conv, message: msg }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create conversation", {
      route: "POST /api/messages",
    });
  }
}
