"use client";

import { Suspense } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { MyCalendar } from "@/components/work/MyCalendar";
import { SetupFrame, useFromWelcome } from "@/components/work/setup/SetupFrame";

export default function CalendarSetupPage() {
  return (
    <Suspense fallback={null}>
      <CalendarSetup />
    </Suspense>
  );
}

/**
 * Connect a calendar: one press, out to Google or Microsoft and back here.
 * Interviews then book into real free time.
 */
function CalendarSetup() {
  const fromWelcome = useFromWelcome();
  // Same cached query MyCalendar uses, so the heading and the panel always agree.
  const { data } = useApiQuery<{ connection: { status: string } | null }>("/api/me/calendar");
  const connected = data?.connection?.status === "connected";

  return (
    <SetupFrame
      sig="Your calendar"
      title={connected ? "Your calendar is connected." : "Connect your calendar."}
      lede="Interviews book themselves into your real free time and land in your calendar with the video link. We only read when you're busy, never what the meeting is."
      done={connected}
    >
      <MyCalendar returnTo={`/work/setup/calendar${fromWelcome ? "?from=welcome" : ""}`} />
    </SetupFrame>
  );
}
