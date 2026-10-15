import { ProgressBarFill } from "@/components/dashboard/ProgressBarFill";
import FitRing from "@/components/ui/FitRing";

export default function FitScoreCardMock() {
  return (
    <div className="card-lifted-marketing p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-center text-sm font-bold leading-8 text-[var(--accent)]">
              J
            </div>
            <div>
              <h3 className="heading-card text-base text-white md:text-lg">John Doe</h3>
              <p className="text-xs text-white/55">Technical Scrum Master · ACME Corporation</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-300">
            Strong Hire
          </span>
          <span className="rounded-md border border-white/12 bg-white/[0.03] px-2.5 py-1 text-[0.65rem] font-semibold text-white/50">
            Session 77
          </span>
        </div>
      </div>

      {/* Four metric cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-[var(--accent)]/22 bg-[var(--accent)]/10 px-4 py-2.5">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[var(--accent)]">
            FitScore
          </p>
          <div className="mt-1 flex items-center justify-between">
            <FitRing score={78} size={44} showLabel={false} />
            <p className="text-sm font-semibold text-white/55">/100</p>
          </div>
        </div>
        <div className="rounded-md border border-emerald-400/22 bg-emerald-500/[0.06] px-4 py-2.5 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-emerald-300">
            Market Rank
          </p>
          <p className="heading-hero mt-0.5 text-2xl text-emerald-300">Top 12%</p>
        </div>
        <div className="rounded-md border border-purple-400/22 bg-purple-500/[0.08] px-4 py-2.5 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-purple-400">
            Ideal Match
          </p>
          <p className="heading-hero mt-0.5 text-2xl text-purple-400">62%</p>
        </div>
        <div className="rounded-md border border-sky-400/22 bg-sky-500/[0.08] px-4 py-2.5 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-sky-300">
            Confidence
          </p>
          <p className="heading-hero mt-0.5 text-2xl text-sky-300">0.87</p>
        </div>
      </div>

      {/* Verdict banner */}
      <div className="mt-4 flex items-center gap-3 rounded-md border border-amber-500/22 bg-amber-500/[0.08] px-4 py-2.5">
        <span className="rounded-md bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300">
          Hidden Gem
        </span>
        <p className="text-[0.8rem] text-white/60">
          Scarce profile with strong upside. Not a perfect criteria match, but merits leadership
          review.
        </p>
      </div>

      {/* Role-specific dimension bars */}
      <div className="mt-5 space-y-2">
        <DimensionBar label="Delivery Governance (25%)" value={85} />
        <DimensionBar label="Technical Acumen (20%)" value={72} />
        <DimensionBar label="Risk Management (20%)" value={78} />
        <DimensionBar label="Stakeholder Comms (15%)" value={91} />
      </div>

      {/* Evidence + flags */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/45">
            Evidence matched
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "Scaled 8 Scrum teams",
              "CSM + PMI-ACP",
              "Cycle time -40%",
              "Cross-functional delivery",
            ].map((item) => (
              <span
                key={item}
                className="rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.68rem] text-white/60"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/45">Flags</p>
          <div className="mt-2 space-y-1 text-[0.75rem] leading-snug text-white/60">
            <p>
              <span className="text-emerald-300">✓</span> Led 8 Scrum teams, cross-functional
            </p>
            <p>
              <span className="text-amber-300">⚠</span> CI/CD hands-on: 1 year (target 2+)
            </p>
            <p>
              <span className="text-rose-300">✗</span> Docker/K8s not detected (required)
            </p>
          </div>
        </div>
      </div>

      {/* WHY THIS VERDICT explanation */}
      <div className="mt-4 rounded-md border border-[var(--accent)]/15 bg-[var(--accent)]/10 px-4 py-2.5">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--accent)]">
          Why this verdict
        </p>
        <p className="mt-1 text-[0.8rem] leading-snug text-white/60 italic">
          &ldquo;Strong delivery governance (85) and stakeholder comms (91). Top 12% across 340
          profiles — rare. Ideal match 62% due to Docker/K8s gap. Market rarity offsets the gap.
          Worth a screening call.&rdquo;
        </p>
      </div>

      {/* Provenance + governance */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-white/45">
            Decision standard
          </p>
          <p className="mt-1 text-xs text-white/60">Approved criteria baseline v4.2</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-white/45">
            Decision trace ID
          </p>
          <p className="mt-1 text-xs text-white/60">TH-7C18F4A9</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-white/45">
            Control status
          </p>
          <p className="mt-1 text-xs text-emerald-300">Decision-ready controls satisfied</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2.5">
        <span className="hover-lift cursor-pointer rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]">
          Advance to interview
        </span>
        <span className="hover-lift cursor-pointer rounded-md border border-white/15 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/25">
          Move to shortlist
        </span>
        <span className="rounded-md border border-white/12 px-5 py-2 text-sm font-semibold text-white/60">
          Compare finalists
        </span>
      </div>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90
      ? "bg-emerald-400"
      : value >= 75
        ? "bg-amber-400"
        : value >= 60
          ? "bg-orange-400"
          : "bg-red-400";

  const glowColor =
    value >= 90
      ? "shadow-[0_0_8px_rgba(34,197,94,0.2)]"
      : value >= 75
        ? "shadow-[0_0_8px_rgba(245,158,11,0.2)]"
        : value >= 60
          ? "shadow-[0_0_8px_rgba(249,115,22,0.2)]"
          : "shadow-[0_0_8px_rgba(239,68,68,0.2)]";

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-white/60 md:w-52">{label}</span>
      <ProgressBarFill
        value={value}
        fillClassName={`${color} ${glowColor} transition-all duration-700`}
      />
      <span className="w-10 shrink-0 text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
