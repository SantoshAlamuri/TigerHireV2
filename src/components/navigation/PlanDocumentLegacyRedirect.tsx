"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { getPlanDocumentLegacyRedirect } from "@/lib/navigation/plan-document-nav-filter";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

const SESSION_PREFIX = "th-plan-nav-redirect:";

/**
 * When Brief 12 plan-document mode is on, redirects legacy routes once per session with a toast.
 * Renders nothing; parent page should return early when this is mounted.
 */
export function PlanDocumentLegacyRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isPlanDocumentUiEnabled()) return;
    const target = getPlanDocumentLegacyRedirect(pathname);
    if (!target) return;

    const key = `${SESSION_PREFIX}${pathname}`;
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        toast({ title: target.message, tone: "info" });
      }
    } catch {
      toast({ title: target.message, tone: "info" });
    }
    router.replace(target.to);
  }, [pathname, router, toast]);

  return null;
}
