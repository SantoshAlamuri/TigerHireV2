import { createSupabaseAdmin } from "./admin";
import { logger } from "@/lib/observability/logger";

/**
 * Execute a multi-step operation via Supabase RPC (which runs inside a
 * Postgres transaction). Falls back to sequential operations if the RPC
 * doesn't exist or returns an error.
 */
export async function executeTransaction<T>(
  rpcName: string,
  params: Record<string, unknown>,
  fallback: () => Promise<T>,
): Promise<T> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.rpc(rpcName, params);

  if (!error && data !== null) {
    return data as T;
  }

  if (error) {
    logger.warn(`Transaction RPC ${rpcName} unavailable, using fallback`, {
      error: error.message,
    });
  }

  return fallback();
}
