"use client";

import { Sparkles } from "lucide-react";
import { SENIORITY_LEVELS } from "@/lib/candidate/resume-inference";
import { inputClass } from "../../_lib/constants";
import { Field, StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function BasicsStep({ s }: { s: OnboardingApi }) {
  const {
    name,
    setName,
    roleTitle,
    setRoleTitle,
    currentCompany,
    setCurrentCompany,
    location,
    setLocation,
    experienceYears,
    setExperienceYears,
    seniorityLevel,
    setSeniorityLevel,
    remotePreference,
    setRemotePreference,
    linkedinUrl,
    setLinkedinUrl,
  } = s;
  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Sparkles size={18} />}
        title="The basics"
        hint="Confirm or edit what we pulled from your résumé."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Current role">
          <input
            className={inputClass}
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
        </Field>
        <Field label="Current company">
          <input
            className={inputClass}
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
          />
        </Field>
        <Field label="Location">
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            max={60}
            className={inputClass}
            value={experienceYears}
            onChange={(e) => setExperienceYears(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Seniority">
          <select
            className={inputClass}
            value={seniorityLevel}
            onChange={(e) => setSeniorityLevel(e.target.value)}
          >
            {SENIORITY_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work style">
          <select
            className={inputClass}
            value={remotePreference}
            onChange={(e) => setRemotePreference(e.target.value)}
          >
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </Field>
        <Field label="LinkedIn (optional)">
          <input
            className={inputClass}
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </Field>
      </div>
    </div>
  );
}
