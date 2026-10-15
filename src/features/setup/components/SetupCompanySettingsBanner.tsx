"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSetupPathForCanonical } from "@/features/setup/config/manifest";

export function SetupCompanySettingsBanner() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user?.isOrgAdmin) return null;

  const setupPath = getSetupPathForCanonical(pathname);
  if (!setupPath) return null;

  return (
    <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
      This setting also lives in{" "}
      <Link
        href={setupPath}
        className="font-medium text-amber-200 underline-offset-2 hover:underline"
      >
        Setup
      </Link>
      .
    </p>
  );
}
