"use client";

import { Bot, Briefcase, Building2, Star, UserCircle, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import type { AnalyticsData } from "./types";

export function StatCardsGrid({ t }: { t: AnalyticsData["totals"] | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Total Candidates"
        value={(t?.candidates ?? 0).toLocaleString()}
        icon={<Users size={20} />}
      />
      <StatCard
        label="Total Organisations"
        value={(t?.companies ?? 0).toLocaleString()}
        icon={<Building2 size={20} />}
      />
      <StatCard
        label="Active Jobs"
        value={(t?.activeJobs ?? 0).toLocaleString()}
        icon={<Briefcase size={20} />}
      />
      <StatCard
        label="Total Scores"
        value={(t?.fitScores ?? 0).toLocaleString()}
        icon={<Star size={20} />}
      />
      <StatCard
        label="Agent Runs"
        value={(t?.agentRuns ?? 0).toLocaleString()}
        icon={<Bot size={20} />}
      />
      <StatCard
        label="Total Users"
        value={(t?.users ?? 0).toLocaleString()}
        icon={<UserCircle size={20} />}
      />
    </div>
  );
}
