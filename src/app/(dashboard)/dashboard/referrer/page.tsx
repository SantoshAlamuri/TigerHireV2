"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import ReferrerDashboardPage from "./ReferrerDashboardPage";

/** Employees use the simplified hub at `/employee`; other roles keep the full referrer dashboard. */
export default function ReferrerPageGate() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "employee") {
      router.replace("/employee");
    }
  }, [loading, user?.role, router]);

  if (loading || user?.role === "employee") {
    return null;
  }

  return <ReferrerDashboardPage />;
}
