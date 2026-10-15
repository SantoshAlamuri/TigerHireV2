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
import { createNotification } from "@/lib/services/notifications";
import { sendEmail } from "@/lib/services/resend";
import { newInboxMessageNotificationHtml } from "@/lib/services/email-templates";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";

type RouteContext = { params: Promise<{ conversationId: string }> };
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const postConversationMessageBodySchema = z
  .object({
    body: z.string().trim().min(1),
    attachment_url: z.string().trim().optional(),
    attachment_name: z.string().trim().optional(),
  })
  .strict();

async function assertParticipant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  conversationId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * GET /api/messages/[conversationId]
 * Get messages in a conversation with pagination. Also marks messages as read.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { conversationId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const isParticipant = await assertParticipant(supabase, conversationId, ctx.userId);
    if (!isParticipant) return jsonError("Conversation not found", 404);

    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return jsonError("Invalid limit: expected an integer >= 1", 400);
    }
    const limit = Math.min(parsedLimit, MAX_LIMIT);
    const before = url.searchParams.get("before");

    let query = supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, body, attachment_url, attachment_name, created_at, edited_at",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      logger.error("Failed to fetch messages", { error: String(error) });
      return jsonError("Failed to fetch messages", 500);
    }

    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", ctx.userId);

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, subject, job_id, created_at, updated_at")
      .eq("id", conversationId)
      .single();

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id, last_read_at")
      .eq("conversation_id", conversationId);

    return jsonSuccess({
      conversation: conv,
      messages: (messages ?? []).reverse(),
      participants: participants ?? [],
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch conversation", {
      route: "GET /api/messages/[conversationId]",
    });
  }
}

/**
 * POST /api/messages/[conversationId]
 * Send a message in a conversation. Body: { body: string, attachment_url?: string, attachment_name?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { conversationId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const isParticipant = await assertParticipant(supabase, conversationId, ctx.userId);
    if (!isParticipant) return jsonError("Conversation not found", 404);

    const parsed = await parseJsonBody<{
      body?: string;
      attachment_url?: string;
      attachment_name?: string;
    }>(request, "POST /api/messages/[conversationId]");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = postConversationMessageBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: ctx.userId,
        body: body.body.trim(),
        attachment_url: body.attachment_url || null,
        attachment_name: body.attachment_name || null,
      })
      .select(
        "id, conversation_id, sender_id, body, attachment_url, attachment_name, created_at, edited_at",
      )
      .single();

    if (error) {
      logger.error("Failed to send message", { error: String(error) });
      return jsonError("Failed to send message", 500);
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", ctx.userId);

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .single();

    const senderName = senderProfile?.full_name ?? "Someone";

    if (participants) {
      for (const p of participants) {
        const ok = await createNotification({
          userId: p.user_id,
          type: "general",
          title: `New message from ${senderName}`,
          body: body.body.trim().slice(0, 100),
          link: `/messages?c=${conversationId}`,
        });
        if (!ok) {
          logger.warn("createNotification failed", {
            route: "POST /api/messages/[conversationId]",
            userId: p.user_id,
          });
        }

        try {
          // profiles has no `email_notifications_enabled` column, so this
          // select failed whole, recipientProfile was null, and the check below
          // read `undefined !== false` — true. The opt-out has never been
          // honoured; every recipient was emailed regardless. Selecting only
          // what exists keeps the same (send-by-default) behaviour, but stops
          // the code claiming to consult a preference it cannot read. Wire this
          // to a real preference store before advertising an opt-out.
          const { data: recipientProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", p.user_id)
            .single();
          void recipientProfile;

          {
            const {
              data: { user: recipientUser },
            } = await supabase.auth.admin.getUserById(p.user_id);
            if (recipientUser?.email) {
              await sendEmail({
                to: recipientUser.email,
                subject: `New message from ${senderName} on TigerHire`,
                html: newInboxMessageNotificationHtml({
                  recipientName: (recipientProfile?.full_name as string | undefined) ?? undefined,
                  senderName,
                  messagePreview: body.body.trim().slice(0, 200),
                  threadUrl: `${env.baseUrl}/messages?c=${conversationId}`,
                }),
              });
            }
          }
        } catch (emailErr) {
          logger.warn("Failed to send message notification email", {
            error: String(emailErr),
          });
        }
      }
    }

    return jsonSuccess({ message: msg }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to send message", {
      route: "POST /api/messages/[conversationId]",
    });
  }
}
