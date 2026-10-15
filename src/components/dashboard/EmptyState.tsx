import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { IconTile } from "@/components/ui/IconTile";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /**
   * Optional fragment rendered extrabold after the title. Replaces the old
   * "bold everything after the first space" heuristic, which gave one-word
   * titles no emphasis and over-bolded long ones (audit F-17).
   */
  emphasis?: string;
  description: string;
  action?: { label: string; href: string };
}

export default function EmptyState({
  icon,
  title,
  emphasis,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="card-lifted rounded-[var(--radius-md)] p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <IconTile size="lg" className="mb-4">
          {icon}
        </IconTile>
        <h3 className="text-xl text-[var(--text)]">
          <span className="font-normal text-[var(--text-muted)]">{title}</span>
          {emphasis ? (
            <>
              {" "}
              <span className="font-extrabold">{emphasis}</span>
            </>
          ) : null}
        </h3>
        <p className="text-body mt-2 max-w-md text-[var(--text-muted)]">{description}</p>
        {action && (
          <Link href={action.href} className={buttonClasses("primary", "md", "mt-6")}>
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
