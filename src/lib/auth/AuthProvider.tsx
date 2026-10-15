"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { User } from "@/types";
import type { UserRole } from "@/types/database";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  userId: string,
  email: string,
): Promise<User | null> {
  const selectWithOrgAdmin =
    "role, organisation_id, full_name, avatar_url, created_at, is_org_admin, organisations(name)";
  let res = await supabase.from("profiles").select(selectWithOrgAdmin).eq("id", userId).single();
  if (
    res.error?.message?.includes("is_org_admin") &&
    res.error?.message?.includes("does not exist")
  ) {
    res = await supabase
      .from("profiles")
      .select("role, organisation_id, full_name, avatar_url, created_at, organisations(name)")
      .eq("id", userId)
      .single();
  }
  const profile = res.data;
  if (!profile) return null;

  const org = profile.organisations as unknown as Record<string, unknown> | null;

  return {
    id: userId,
    email,
    name: profile.full_name ?? email,
    role: profile.role as UserRole,
    avatar: profile.avatar_url ?? undefined,
    organisationId: profile.organisation_id ?? undefined,
    organisationName: (org?.name as string) ?? undefined,
    createdAt: profile.created_at ?? new Date().toISOString(),
    isOrgAdmin: Boolean((profile as { is_org_admin?: boolean }).is_org_admin),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const router = useRouter();
  const supabase = useMemo(
    () => (isSupabaseConfigured() ? createSupabaseBrowserClient() : null),
    [],
  );

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const resolveUser = async (authUser: { id: string; email?: string | null }) => {
      if (cancelled) return;
      try {
        let profile = await fetchProfile(supabase, authUser.id, authUser.email ?? "");

        // Profile missing — try to create one via ensure-profile endpoint (uses admin client, bypasses RLS)
        if (!profile && !cancelled) {
          try {
            const res = await fetch("/api/auth/ensure-profile", {
              method: "POST",
              credentials: "include",
            });
            if (res.ok) {
              const ensureData = await res.json();
              // Retry browser-side fetch first
              profile = await fetchProfile(supabase, authUser.id, authUser.email ?? "");
              // If browser query still fails (e.g. RLS), build user from API response
              if (!profile && ensureData?.role) {
                profile = {
                  id: authUser.id,
                  email: authUser.email ?? "",
                  name: ensureData.fullName ?? authUser.email ?? "",
                  role: ensureData.role as UserRole,
                  createdAt: new Date().toISOString(),
                };
              }
            }
          } catch {
            // ensure-profile failed — profile stays null
          }
        }

        if (!cancelled) setUser(profile);
      } catch {
        // Profile fetch failed — user stays null, DashboardShell will redirect to login
      }
      if (!cancelled) setLoading(false);
    };

    // Read session from cookies (no network call).
    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        if (cancelled) return;
        if (session?.user) {
          resolveUser(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    // Listen for auth state changes (OAuth callback, token refresh, sign-out).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        // Already handled by getSession above — skip.
        return;
      }

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        resolveUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Server unreachable — still clear client state.
    }
    await supabase?.auth.signOut();
    setUser(null);
    router.push("/login");
  }, [router, supabase]);

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
