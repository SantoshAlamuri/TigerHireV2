import Link from "next/link";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  href?: string;
}

export default function StatCard({ label, value, trend, icon, href }: StatCardProps) {
  const content = (
    <div
      className={`card-lifted h-full min-h-[92px] rounded-xl p-3.5 ${href ? "card-lifted-hover" : ""}`}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr] gap-x-2.5 gap-y-1">
        <p className="text-body self-start text-sm font-normal leading-tight text-white/60">
          {label}
        </p>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
            {icon}
          </div>
        )}
        <div className="col-span-2 row-start-2 flex min-h-0 flex-col justify-end">
          <p
            className="text-2xl leading-none font-extrabold tabular-nums [font-variant-numeric:tabular-nums] text-[var(--text)]"
            suppressHydrationWarning
          >
            {value}
          </p>
          {trend && (
            <span
              className={`mt-1 inline-block text-body text-sm ${trend.positive ? "text-emerald-400" : "text-red-400"}`}
            >
              {trend.value}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="block h-full rounded-xl focus:outline-none focus:ring-2 focus:ring-white/25"
    >
      {content}
    </Link>
  );
}
