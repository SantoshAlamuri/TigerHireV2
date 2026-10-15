import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_COOKIE_OPTIONS } from "./cookie-options";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are required. Check your .env.local file.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...SUPABASE_COOKIE_OPTIONS,
              ...options,
            }),
          );
        } catch {
          // setAll called from Server Component — safe to ignore
        }
      },
    },
  });
}
