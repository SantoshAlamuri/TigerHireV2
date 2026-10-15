"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "../../_lib/constants";
import { StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function SkillsStep({ s }: { s: OnboardingApi }) {
  const { skills, setSkills, newSkill, setNewSkill } = s;
  return (
    <div className="space-y-4">
      <StepHeading
        icon={<Sparkles size={18} />}
        title="Your skills"
        hint="Add the ones that matter for the roles you want."
      />
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.04] px-3 py-1 text-xs text-[var(--text)]"
          >
            {skill}
            <button
              type="button"
              onClick={() => setSkills(skills.filter((x) => x !== skill))}
              aria-label={`Remove ${skill}`}
              className="focus-ring rounded-full text-[var(--text-subtle)] hover:text-[var(--text)]"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {skills.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">No skills yet — add a few below.</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={newSkill}
          placeholder="e.g. TypeScript"
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const t = newSkill.trim();
              if (t && !skills.includes(t)) setSkills([...skills, t]);
              setNewSkill("");
            }
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const t = newSkill.trim();
            if (t && !skills.includes(t)) setSkills([...skills, t]);
            setNewSkill("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
