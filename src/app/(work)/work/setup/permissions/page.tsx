"use client";

import { Suspense, useEffect, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import type { PermissionsSettingsInput } from "@/lib/validations/integrations";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

type Key = keyof PermissionsSettingsInput;

const DEFAULTS: PermissionsSettingsInput = {
  recruiterCanManageIntegrations: false,
  recruiterCanManagePrivacy: false,
  recruiterCanReadAudit: false,
  hiringManagerCanViewSettings: false,
  hiringManagerCanReadAudit: false,
  recruiterCanCreateOffers: true,
  hiringManagerCanCreateOffers: false,
  recruiterCanCreateAssessments: true,
  hiringManagerCanCreateAssessments: true,
  recruiterCanManageAssessmentTemplates: true,
  hiringManagerCanManageAssessmentTemplates: true,
  requisitionAdvancedMode: false,
};

/** One row per thing someone might be allowed to do, with a switch per role. */
const ROWS: { what: string; recruiter?: Key; hm?: Key }[] = [
  { what: "Connect tools like the HR system", recruiter: "recruiterCanManageIntegrations" },
  { what: "Change privacy settings", recruiter: "recruiterCanManagePrivacy" },
  {
    what: "Read the audit log",
    recruiter: "recruiterCanReadAudit",
    hm: "hiringManagerCanReadAudit",
  },
  { what: "See Setup", hm: "hiringManagerCanViewSettings" },
  {
    what: "Make offers",
    recruiter: "recruiterCanCreateOffers",
    hm: "hiringManagerCanCreateOffers",
  },
  {
    what: "Send tests",
    recruiter: "recruiterCanCreateAssessments",
    hm: "hiringManagerCanCreateAssessments",
  },
  {
    what: "Edit test templates",
    recruiter: "recruiterCanManageAssessmentTemplates",
    hm: "hiringManagerCanManageAssessmentTemplates",
  },
];

export default function PermissionsSetupPage() {
  return (
    <Suspense fallback={null}>
      <PermissionsSetup />
    </Suspense>
  );
}

/** Who can do what. Admins can always do everything; these switches are for everyone else. */
function PermissionsSetup() {
  const { data, loading, error, refetch } = useApiQuery<{ permissions: PermissionsSettingsInput }>(
    "/api/settings/permissions",
  );
  const [values, setValues] = useState<PermissionsSettingsInput | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (data) setValues({ ...DEFAULTS, ...(data.permissions ?? {}) });
  }, [data]);

  const flip = async (key: Key) => {
    if (!values) return;
    const before = values;
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/permissions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify(next),
    }).catch(() => null);
    if (!res?.ok) {
      setValues(before);
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setProblem(body?.error ?? "Couldn't change that. Try again.");
      return;
    }
    await refetch({ silent: true });
  };

  const Switch = ({ k, label }: { k?: Key; label: string }) =>
    k && values ? (
      <button
        type="button"
        className="wd-toggle"
        aria-pressed={!!values[k]}
        aria-label={`${label} ${values[k] ? "allowed" : "not allowed"}`}
        onClick={() => void flip(k)}
      />
    ) : (
      <span className="wd-small wd-muted" aria-label="Not applicable">
        —
      </span>
    );

  return (
    <SetupFrame
      sig="Permissions"
      title="Who can do what."
      lede="Admins can always do everything. These switches decide what recruiters and hiring managers can do on top of their own work. Changes save as you flip them."
    >
      {loading && !values ? (
        <p role="status" className="wd-muted">
          Loading permissions…
        </p>
      ) : error || !values ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load permissions. Only admins can see this page.
        </p>
      ) : (
        <div className="wd-table-wrap">
          <table className="wd-table wd-perm">
            <thead>
              <tr>
                <th scope="col">Allowed to</th>
                <th scope="col">Recruiters</th>
                <th scope="col">Hiring managers</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.what}>
                  <th scope="row">{r.what}</th>
                  <td>
                    <Switch k={r.recruiter} label={`Recruiters: ${r.what}`} />
                  </td>
                  <td>
                    <Switch k={r.hm} label={`Hiring managers: ${r.what}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {problem && (
        <p role="alert" className="wd-problem">
          {problem}
        </p>
      )}
    </SetupFrame>
  );
}
