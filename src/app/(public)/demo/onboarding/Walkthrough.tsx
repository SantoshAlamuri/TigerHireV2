"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const steps = ["Account", "Verify email", "Company", "Team", "Hiring defaults", "Complete"];
const inputClass =
  "mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3 text-[var(--text)] focus-ring";
const initial = {
  name: "Alex Morgan",
  email: "alex@northstar.example",
  company: "Northstar Labs",
  teammate: "jordan@northstar.example",
  role: "Recruiter",
  pipeline: "Application → Screening → Interview → Offer",
};

/** Entirely in-memory: no auth, API requests, invitations, or database writes. */
export default function Walkthrough() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initial);
  const [invited, setInvited] = useState(false);
  const next = () => setStep((value) => Math.min(value + 1, steps.length - 1));

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          <strong>Isolated demo</strong> · Fictional data only. No account is created and no email
          is sent. Verification is simulated. Refreshing resets the walkthrough.
        </div>
        <header className="my-8">
          <p className="text-sm text-[var(--accent)]">TIGERHIRE / COMPANY ONBOARDING</p>
          <h1 className="mt-2 text-3xl font-semibold">From signup to your hiring workspace</h1>
          <p className="mt-3 text-[var(--text-muted)]">
            Step {step + 1} of {steps.length} · {steps[step]}
          </p>
          <ol aria-label="Onboarding progress" className="mt-4 flex flex-wrap gap-2">
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs ${index === step ? "border-amber-400 text-amber-200" : "border-[var(--border)] text-[var(--text-muted)]"}`}
              >
                {index < step ? "✓ " : `${index + 1}. `}
                {label}
              </li>
            ))}
          </ol>
        </header>
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
          aria-label={steps[step]}
        >
          <h2 className="text-2xl font-semibold">
            {
              [
                "Create your company account",
                "Verify your work email",
                "Review company details",
                "Invite your hiring team",
                "Review hiring defaults",
                "Your demo workspace is ready",
              ][step]
            }
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            {
              [
                "Creating a new workspace? Start here. Recruiters joining an existing company should use an admin invitation instead.",
                `In the real flow, open the verification link sent to ${data.email}, then sign in. Here, use the simulated verification button below.`,
                "Confirm the company and contact information your team will use.",
                "Choose who will help you hire and what access they need. You can also do this later.",
                "Review the stages new jobs start with. The real Setup area also contains recruitment plans, screening questions, and approval settings.",
                "Account, verification, and setup have been simulated successfully. Your next real action would be opening the hiring dashboard to create a job.",
              ][step]
            }
          </p>
          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 3) setInvited(true);
              next();
            }}
          >
            {(step === 0 || step === 2) && (
              <>
                <label className="block text-sm">
                  Company name
                  <input
                    required
                    className={inputClass}
                    value={data.company}
                    onChange={(event) => setData({ ...data, company: event.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Full name
                  <input
                    required
                    className={inputClass}
                    value={data.name}
                    onChange={(event) => setData({ ...data, name: event.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Work email
                  <input
                    required
                    type="email"
                    className={inputClass}
                    value={data.email}
                    onChange={(event) => setData({ ...data, email: event.target.value })}
                  />
                </label>
                {step === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Demo authentication requires no password. Real signup requires a password or a
                    sign-in provider.
                  </p>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <label className="block text-sm">
                  Teammate work email
                  <input
                    required
                    type="email"
                    className={inputClass}
                    value={data.teammate}
                    onChange={(event) => setData({ ...data, teammate: event.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Access role
                  <select
                    className={inputClass}
                    value={data.role}
                    onChange={(event) => setData({ ...data, role: event.target.value })}
                  >
                    <option>Recruiter</option>
                    <option>Hiring manager</option>
                  </select>
                </label>
                <p className="text-xs text-[var(--text-muted)]">
                  Invitation preview only. No message will be sent.
                </p>
              </>
            )}
            {step === 4 && (
              <label className="block text-sm">
                Default interview stages
                <input
                  required
                  className={inputClass}
                  value={data.pipeline}
                  onChange={(event) => setData({ ...data, pipeline: event.target.value })}
                />
              </label>
            )}
            {step === 5 ? (
              <>
                <CheckCircle2 size={36} className="text-emerald-400" aria-hidden />
                <dl className="space-y-4 rounded-xl border border-[var(--border)] p-5 text-sm">
                  <div>
                    <dt className="text-[var(--text-muted)]">Company</dt>
                    <dd className="mt-1 font-medium">{data.company}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Workspace owner</dt>
                    <dd className="mt-1">
                      {data.name} · {data.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Team invitation (simulated)</dt>
                    <dd className="mt-1">
                      {invited
                        ? `${data.teammate} · ${data.role}`
                        : "Skipped — invite teammates later"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Hiring stages</dt>
                    <dd className="mt-1">{data.pipeline}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    setStep(0);
                    setData(initial);
                    setInvited(false);
                  }}
                  className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm"
                >
                  Restart walkthrough
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black"
                >
                  {
                    [
                      "Create demo account",
                      "Simulate email verification and sign-in",
                      "Save company details",
                      "Simulate invitation and continue",
                      "Save defaults and finish",
                    ][step]
                  }
                  <ArrowRight size={16} />
                </button>
                {step === 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvited(false);
                      next();
                    }}
                    className="px-3 py-2 text-sm text-[var(--text-muted)]"
                  >
                    Invite later
                  </button>
                )}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
