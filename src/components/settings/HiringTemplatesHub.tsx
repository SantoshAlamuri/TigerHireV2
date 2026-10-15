"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OfferLetterTemplatesPanel } from "@/components/settings/OfferLetterTemplatesPanel";
import { RequisitionTemplatesSettingsPanel } from "@/components/settings/RequisitionTemplatesSettingsPanel";
import { InterviewFeedbackTemplatesPanel } from "@/components/settings/InterviewFeedbackTemplatesPanel";
import { AssessmentTemplateLibraryPanel } from "@/components/settings/AssessmentTemplateLibraryPanel";
import {
  HIRING_TEMPLATE_TABS,
  parseHiringTemplateTab,
  type HiringTemplateTab,
} from "@/lib/settings/hiring-templates";

export function HiringTemplatesHub({
  jobsBasePath,
  assessmentsHref = "/recruit/assessments",
  showRequisitionTab = true,
}: {
  jobsBasePath: string;
  assessmentsHref?: string;
  /** Setup hiring-config includes requisition templates; company/recruit hub may hide if only on setup. */
  showRequisitionTab?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = parseHiringTemplateTab(searchParams.get("tab"));

  const tabs = useMemo(
    () =>
      showRequisitionTab
        ? HIRING_TEMPLATE_TABS
        : HIRING_TEMPLATE_TABS.filter((tab) => tab.id !== "requisition"),
    [showRequisitionTab],
  );

  const setTab = useCallback(
    (tab: HiringTemplateTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const resolvedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (tabs[0]?.id ?? "offer-letters");

  return (
    <div className="space-y-6">
      <nav
        aria-label="Template types"
        className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-4"
      >
        {tabs.map((tab) => {
          const active = tab.id === resolvedTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              title={tab.description}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-9 flex-col items-start rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-white/[0.02] hover:border-[var(--border-hover)] hover:bg-white/[0.05]"
              }`}
            >
              <span
                className={`text-xs font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
              >
                {tab.label}
              </span>
              <span className="mt-0.5 max-w-[14rem] text-[10px] leading-snug text-white/50">
                {tab.description}
              </span>
            </button>
          );
        })}
      </nav>

      {resolvedTab === "requisition" ? <RequisitionTemplatesSettingsPanel /> : null}
      {resolvedTab === "offer-letters" ? <OfferLetterTemplatesPanel /> : null}
      {resolvedTab === "feedback" ? (
        <InterviewFeedbackTemplatesPanel jobsBasePath={jobsBasePath} />
      ) : null}
      {resolvedTab === "assessments" ? (
        <AssessmentTemplateLibraryPanel assessmentsHref={assessmentsHref} />
      ) : null}
    </div>
  );
}
