"use client";

import { Suspense } from "react";
import { EmployeeReferralHub } from "./components/EmployeeReferralHub";
import { Skeleton } from "@/components/ui/Skeleton";

function ReferralHubFallback() {
  return (
    <div className="space-y-4 py-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function EmployeeDashboard() {
  return (
    <Suspense fallback={<ReferralHubFallback />}>
      <EmployeeReferralHub />
    </Suspense>
  );
}
