import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_COOKIE_OPTIONS } from "./cookie-options";

const isDev = process.env.NODE_ENV === "development";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are required for middleware session updates.",
    );
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...SUPABASE_COOKIE_OPTIONS,
            ...options,
          }),
        );
      },
    },
  });

  // In dev, use getSession() (local JWT check, no network call) instead of
  // getUser() (Supabase round-trip). Saves 500-2000ms per request locally.
  // Production always uses getUser() for security (catches revoked tokens).
  let user = null;
  if (isDev) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  } else {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  }

  return { supabase, user, supabaseResponse };
}
