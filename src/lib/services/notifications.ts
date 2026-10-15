import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, string>;
}

/**
 * Insert an in-app notification for a user. Uses the service-role client
 * so it can write to any user's notifications regardless of RLS.
 * @returns true if the row was inserted, false if the insert failed (error is also logged).
 */
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    logger.error("Notification insert failed", { error: String(error) });
    return false;
  }
  return true;
}

/**
 * Send the same notification to multiple users.
 */
export async function createNotificationBatch(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">,
) {
  if (userIds.length === 0) return;
  const supabase = createSupabaseAdmin();
  const rows = userIds.map((userId) => ({
    user_id: userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    logger.error("Notification batch insert failed", { error: String(error) });
  }
}
