"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  HOME_TILES,
  HOME_UNEVALUATED_BY_ROLE,
  type HomeTileDef,
  type HomeTileUserContext,
} from "@/lib/home/tile-registry";

/**
 * Home — what needs this seat, then what is worth knowing.
 *
 * It was one flat grid of metric cards sorted by a priority number, so "4
 * candidates waiting on your decision" and "open job postings in your
 * organisation" rendered as the same kind of object, at the same weight, and
 * the reader had to work out which one was asking for something. Splitting the
 * two is the whole change: a seat opening this page should be able to tell in
 * one glance whether it owes anybody anything.
 *
 * The other half of the change is subtraction. Four tiles served a hardcoded
 * zero from the API — two of the interviewer's three, so that seat's Home said
 * "nothing needs you" on every load regardless of what was actually waiting.
 * They are gone, and what they claimed to measure is named at the foot of the
 * page as something this screen does not check. An absent signal the reader
 * knows about beats a zero they believe.
 */
function tilesFor(ctx: HomeTileUserContext): { action: HomeTileDef[]; context: HomeTileDef[] } {
  const visible = HOME_TILES.filter((t) => t.visibleTo(ctx)).sort(
    (a, b) => a.priority - b.priority,
  );
  return {
    action: visible.filter((t) => t.kind === "action"),
    context: visible.filter((t) => t.kind === "context"),
  };
}

function Grid({ tiles }: { tiles: HomeTileDef[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => {
        const Tile = t.component;
        return <Tile key={t.id} />;
      })}
    </div>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();

  const ctx: HomeTileUserContext | null = useMemo(
    () => (user ? { role: user.role, is_org_admin: Boolean(user.isOrgAdmin) } : null),
    [user],
  );
  const { action, context } = useMemo(
    () => (ctx ? tilesFor(ctx) : { action: [], context: [] }),
    [ctx],
  );
  const unevaluated = ctx ? (HOME_UNEVALUATED_BY_ROLE[ctx.role] ?? []) : [];

  if (loading) {
    return <div className="h-8 w-48 animate-pulse rounded bg-[var(--surface)]" />;
  }
  if (!user) return null;

  return (
    <div>
      {/* The shell's <main> already pads the page; Home added its own on top,
          so this was the one screen whose content started further in than
          every other. And the title is the shared PageHeader now, at the same
          scale as the rest of the product rather than its own. */}
      <PageHeader
        title="Home"
        subtitle={
          action.length > 0
            ? "What needs you, then what is worth knowing."
            : "Nothing on this page is waiting on you — the rest is context."
        }
      />

      {action.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Needs you
          </h2>
          <Grid tiles={action} />
        </section>
      )}

      {context.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            {action.length > 0 ? "Context" : "Your workspace"}
          </h2>
          <Grid tiles={context} />
        </section>
      )}

      {action.length === 0 && context.length === 0 && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          This seat has no Home tiles yet. Use the navigation above to reach your work.
        </p>
      )}

      {unevaluated.length > 0 && (
        <p className="mt-6 text-xs text-white/40">
          Not checked here: {unevaluated.join(" and ")} — these are not wired up yet, so nothing on
          this page reflects them. They are absent rather than shown as zero.
        </p>
      )}
    </div>
  );
}
