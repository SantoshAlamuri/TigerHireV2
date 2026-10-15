"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { TasksPageClient } from "./TasksPageClient";

export default function OrgTasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <TasksPageClient />
    </Suspense>
  );
}
