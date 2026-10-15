"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { ReferProfileNeedsSetup, ReferProfilePayload, TabKey } from "../_lib/types";
import { useReferralLinks } from "./useReferralLinks";
import { useReferrerSetupFlow } from "./useReferrerSetupFlow";

export function useReferrerDashboard() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferProfilePayload | null>(null);
  const [setupMode, setSetupMode] = useState(false);

  const linkedJobIdSet = useMemo(
    () => new Set((data?.links ?? []).map((l) => l.job_id)),
    [data?.links],
  );

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/refer/dashboard/profile", { credentials: "include" });
    if (!res.ok) return null;
    const json = (await res.json()) as ReferProfilePayload | ReferProfileNeedsSetup;
    if ("needs_setup" in json && json.needs_setup) return { needsSetup: true as const };
    return { needsSetup: false as const, data: json as ReferProfilePayload };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSetupMode(false);
      if (cancelled) return;
      const first = await loadDashboard();
      if (cancelled) return;
      if (first && !first.needsSetup) {
        setData(first.data);
        setLoading(false);
        return;
      }

      setData(null);
      setSetupMode(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (
      t === "overview" ||
      t === "network" ||
      t === "links" ||
      t === "candidates" ||
      t === "leaderboard"
    ) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const totalCandidatesReferred = useMemo(() => {
    if (!data) return 0;
    const fromLinks = data.links.reduce((sum, row) => sum + row.applied_count, 0);
    const employeeInvites = data.employee_whatsapp_referrals?.length ?? 0;
    return Math.max(
      fromLinks,
      data.candidate_applications.length,
      data.payouts.length,
      employeeInvites,
    );
  }, [data]);

  const myRank = useMemo(() => {
    if (!data) return null;
    return data.leaderboard.find((r) => r.is_current)?.rank ?? null;
  }, [data]);
  const payoutRealization = useMemo(() => {
    if (!data) return 0;
    const total = data.earnings.pending_inr + data.earnings.paid_inr;
    if (total <= 0) return 0;
    return Math.round((data.earnings.paid_inr / total) * 100);
  }, [data]);
  const linkActivationRate = useMemo(() => {
    if (!data || data.links.length === 0) return 0;
    const activeLinks = data.links.filter((l) => l.applied_count > 0).length;
    return Math.round((activeLinks / data.links.length) * 100);
  }, [data]);

  const linkActions = useReferralLinks({ loadDashboard, setData, linkedJobIdSet });
  const setupFlow = useReferrerSetupFlow({ loadDashboard, setData, setSetupMode });

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "network", label: "Network & Invites" },
    { id: "links", label: "My Links" },
    { id: "candidates", label: "Referred Candidates" },
    { id: "leaderboard", label: "Leaderboard" },
  ];

  const title = "Refer & Earn";
  const subtitle = useMemo(() => {
    if (user?.role === "employee") {
      return "Same hub as candidate referrers: personal apply links for open roles, share with people you want to refer, then track applicants and bonuses here.";
    }
    return "Create personal apply links, share them with people you want to refer, and track applicants and payouts in one place.";
  }, [user?.role]);

  return {
    activeTab,
    setActiveTab,
    loading,
    data,
    setupMode,
    linkedJobIdSet,
    totalCandidatesReferred,
    myRank,
    payoutRealization,
    linkActivationRate,
    tabs,
    title,
    subtitle,
    ...linkActions,
    ...setupFlow,
  };
}
