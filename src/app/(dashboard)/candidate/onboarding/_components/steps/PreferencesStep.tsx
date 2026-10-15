"use client";

import { Sparkles } from "lucide-react";
import { ROLE_FUNCTIONS, SENIORITY_LEVELS } from "@/lib/candidate/resume-inference";
import { REMOTE_OPTIONS, inputClass } from "../../_lib/constants";
import { toggle } from "../../_lib/helpers";
import { ChipToggle, Field, StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function PreferencesStep({ s }: { s: OnboardingApi }) {
  const {
    prefRemote,
    setPrefRemote,
    prefRoles,
    setPrefRoles,
    prefSeniority,
    setPrefSeniority,
    salaryMinLpa,
    setSalaryMinLpa,
    salaryMaxLpa,
    setSalaryMaxLpa,
  } = s;
  return (
    <div className="space-y-5">
      <StepHeading
        icon={<Sparkles size={18} />}
        title="What you're looking for"
        hint="We use this to surface the right roles."
      />
      <Field label="Work style">
        <div className="flex flex-wrap gap-2">
          {REMOTE_OPTIONS.map((opt) => (
            <ChipToggle
              key={opt}
              active={prefRemote === opt}
              onClick={() => setPrefRemote(opt)}
              label={opt}
            />
          ))}
        </div>
      </Field>
      <Field label="Role functions">
        <div className="flex flex-wrap gap-2">
          {ROLE_FUNCTIONS.map((rf) => (
            <ChipToggle
              key={rf}
              active={prefRoles.includes(rf)}
              onClick={() => setPrefRoles(toggle(prefRoles, rf))}
              label={rf}
            />
          ))}
        </div>
      </Field>
      <Field label="Seniority">
        <div className="flex flex-wrap gap-2">
          {SENIORITY_LEVELS.map((lvl) => (
            <ChipToggle
              key={lvl}
              active={prefSeniority.includes(lvl)}
              onClick={() => setPrefSeniority(toggle(prefSeniority, lvl))}
              label={lvl}
            />
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Min salary (LPA)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={salaryMinLpa}
            onChange={(e) => setSalaryMinLpa(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Max salary (LPA)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={salaryMaxLpa}
            onChange={(e) => setSalaryMaxLpa(Number(e.target.value) || 0)}
          />
        </Field>
      </div>
    </div>
  );
}
