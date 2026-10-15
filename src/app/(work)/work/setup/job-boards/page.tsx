"use client";

import { Suspense } from "react";
import { SetupFrame } from "@/components/work/setup/SetupFrame";
import { Connections } from "@/components/work/setup/Connections";

export default function JobBoardsSetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupFrame
        sig="Job boards"
        title="Where your jobs are posted."
        lede="Connect a board once and every job you publish can go out to it. Applications come back into the job on their own."
      >
        <Connections groups={[{ title: "Boards", providers: ["idibu", "indeed", "adzuna"] }]} />
      </SetupFrame>
    </Suspense>
  );
}
