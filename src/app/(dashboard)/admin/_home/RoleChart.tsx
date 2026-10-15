"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/Skeleton";
import { REPORT_CARD_CLASS } from "./helpers";

type RoleChartProps = {
  roleCounts: Record<string, number>;
};

export function RoleChart({ roleCounts }: RoleChartProps) {
  const roleChartContainerRef = useRef<HTMLDivElement | null>(null);
  const [roleChartReady, setRoleChartReady] = useState(false);

  useEffect(() => {
    const el = roleChartContainerRef.current;
    if (!el) return;

    const update = () => {
      setRoleChartReady(el.clientWidth > 0 && el.clientHeight > 0);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <div className={REPORT_CARD_CLASS}>
      <h2 className="heading-section mb-4 text-lg text-[var(--text)]">Users by role</h2>
      <div ref={roleChartContainerRef} className="h-64 min-h-[240px] min-w-0">
        {roleChartReady ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={Object.entries(roleCounts).map(([role, count]) => ({
                role,
                count,
              }))}
              margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
              <XAxis dataKey="role" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
                cursor={{ fill: "rgba(249, 115, 22, 0.08)" }}
              />
              <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Users" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className="h-full w-full rounded-xl" aria-hidden />
        )}
      </div>
    </div>
  );
}
