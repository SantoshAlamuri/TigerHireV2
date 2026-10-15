import type { SupabaseClient } from "@supabase/supabase-js";

export const NotificationRepository = {
  async list(supabase: SupabaseClient, userId: string, offset: number, limit: number) {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  },

  async unreadCount(supabase: SupabaseClient, userId: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(supabase: SupabaseClient, userId: string, ids: string[]) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw error;
  },

  async markAllRead(supabase: SupabaseClient, userId: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
  },

  async create(
    supabase: SupabaseClient,
    payload: {
      userId: string;
      type: string;
      title: string;
      body?: string;
      link?: string;
      metadata?: Record<string, string>;
    },
  ) {
    const { error } = await supabase.from("notifications").insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
      metadata: payload.metadata ?? {},
    });
    if (error) throw error;
  },

  async createBatch(
    supabase: SupabaseClient,
    notifications: Array<{
      userId: string;
      type: string;
      title: string;
      body?: string;
      link?: string;
    }>,
  ) {
    if (notifications.length === 0) return;
    const rows = notifications.map((n) => ({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      metadata: {},
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) throw error;
  },
};
