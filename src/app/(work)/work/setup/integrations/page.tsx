"use client";

import { Suspense } from "react";
import { SetupFrame } from "@/components/work/setup/SetupFrame";
import { Connections } from "@/components/work/setup/Connections";

export default function IntegrationsSetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupFrame
        sig="Connected tools"
        title="The tools TigerHire talks to."
        lede="Your HR system, background checks, email sending and company sign-in. Keys are stored encrypted and shown only as the last four characters."
      >
        <Connections
          groups={[
            {
              title: "HR system",
              providers: ["darwinbox", "keka", "hibob", "bamboohr", "workday"],
            },
            { title: "Background checks", providers: ["springverify"] },
            { title: "Email sending", providers: ["resend", "sendgrid"] },
            { title: "Company sign-in", providers: ["google_sso", "microsoft_sso", "okta_sso"] },
          ]}
        />
      </SetupFrame>
    </Suspense>
  );
}
