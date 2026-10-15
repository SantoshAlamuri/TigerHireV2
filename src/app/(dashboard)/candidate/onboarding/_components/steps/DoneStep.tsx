"use client";

import Link from "next/link";
import { ArrowRight, Check, Gift } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconTile } from "@/components/ui/IconTile";
import { StepHeading } from "../primitives";
import type { OnboardingApi } from "../../_hooks/use-onboarding";

export function DoneStep({ s }: { s: OnboardingApi }) {
  const { completeness, setStep, phoneVerified, dismissOnboarding, router } = s;
  return (
    <div className="space-y-5">
      <StepHeading
        icon={<Check size={18} />}
        title="You're set up"
        hint={`Profile strength ${completeness.pct}% — you can refine anytime.`}
      />
      {completeness.missing.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Optional finishing touches
          </p>
          <ul className="space-y-1.5">
            {completeness.missing.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => setStep(m.step)}
                  className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] focus-ring rounded-[var(--radius-sm)]"
                >
                  + {m.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] p-4">
        <div className="flex items-start gap-3">
          <IconTile size="md">
            <Gift size={18} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text)]">Refer &amp; earn</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {phoneVerified
                ? "Your number's verified — start sharing roles and get paid when they're hired."
                : "Verify your WhatsApp and you can refer others with one tap — no second setup."}
            </p>
            <div className="mt-3">
              {phoneVerified ? (
                <Link href="/dashboard/referrer" className={buttonClasses("secondary", "sm")}>
                  Start referring
                </Link>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setStep("verify")}>
                  Verify to refer
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={() => {
          dismissOnboarding();
          router.push("/candidate");
        }}
        className="w-full"
      >
        Go to my matches
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
