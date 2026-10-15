import Link from "next/link";
import { SETUP_AREAS } from "@/features/setup/config/manifest";

export default function SetupLandingPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Setup</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
        Manage your company details, team, and hiring defaults here. New to TigerHire? Start with
        the steps below, then return to these settings whenever you need to make changes.
      </p>
      <section
        aria-labelledby="getting-started"
        className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-5"
      >
        <h2 id="getting-started" className="text-lg font-medium">
          Start your company setup
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              href: "/setup/organization/profile",
              title: "1. Review company details",
              description: "Check the company information your team will use.",
            },
            {
              href: "/setup/organization/team",
              title: "2. Invite your hiring team",
              description: "Add colleagues and assign access for their responsibilities.",
            },
            {
              href: "/setup/hiring-config",
              title: "3. Review hiring defaults",
              description: "Set up your recruitment plan, interview stages, and approvals.",
            },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {item.title}
              </Link>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</p>
            </li>
          ))}
        </ol>
        <Link
          href="/company"
          className="mt-5 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
        >
          Go to hiring dashboard
        </Link>
      </section>
      <h2 className="mt-8 text-lg font-medium">All settings</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SETUP_AREAS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-5 transition hover:border-amber-300/40 hover:bg-[var(--surface)]"
          >
            <h2 className="text-lg font-medium text-[var(--text)]">{a.label}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{a.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
