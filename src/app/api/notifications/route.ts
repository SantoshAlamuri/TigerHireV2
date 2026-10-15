import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
  parseJsonBody,
} from "@/lib/api-helpers";
import { NotificationRepository } from "@/lib/repositories/NotificationRepository";
import { validateOrigin } from "@/lib/security/csrf";

/** Either mark all read for the user, or mark specific notification ids (max 50). */
const notificationPatchBodySchema = z.union([
  z.object({ markAllRead: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(50) }),
]);

const NOTIFICATION_CACHE_TTL_MS = 10_000;
const notificationResponseCache = new Map<
  string,
  {
    at: number;
    value: {
      notifications: Awaited<ReturnType<typeof NotificationRepository.list>>;
      unreadCount: number;
    };
  }
>();

function notificationCacheKey(userId: string, limit: number, offset: number): string {
  return `${userId}:${limit}:${offset}`;
}

function invalidateNotificationCache(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of notificationResponseCache.keys()) {
    if (key.startsWith(prefix)) {
      notificationResponseCache.delete(key);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const cacheKey = notificationCacheKey(ctx.userId, limit, offset);
    const cached = notificationResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < NOTIFICATION_CACHE_TTL_MS) {
      return jsonSuccess(cached.value);
    }

    const supabase = await createSupabaseServerClient();
    const [notifications, unreadCount] = await Promise.all([
      NotificationRepository.list(supabase, ctx.userId, offset, limit),
      NotificationRepository.unreadCount(supabase, ctx.userId),
    ]);

    const value = { notifications, unreadCount };
    notificationResponseCache.set(cacheKey, { at: Date.now(), value });
    return jsonSuccess(value);
  } catch (err) {
    return handleApiError(err, "Failed to fetch notifications", {
      route: "GET /api/notifications",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/notifications");
    if (errorResponse) return errorResponse;

    const parsed = notificationPatchBodySchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();

    if ("markAllRead" in parsed.data) {
      await NotificationRepository.markAllRead(supabase, ctx.userId);
      invalidateNotificationCache(ctx.userId);
      return jsonSuccess({ updated: true });
    }

    await NotificationRepository.markRead(supabase, ctx.userId, parsed.data.ids);
    invalidateNotificationCache(ctx.userId);
    return jsonSuccess({ updated: true });
  } catch (err) {
    return handleApiError(err, "Failed to update notifications", {
      route: "PATCH /api/notifications",
    });
  }
}
