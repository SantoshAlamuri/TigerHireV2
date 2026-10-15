"use client";

import { labelClass } from "@/lib/styles/form";

const boxClass = "rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-4 space-y-2.5";

type ControlledProps = {
  mode: "controlled";
  compact?: boolean;
  listOnPublicJobBoard: boolean;
  listForInternalReferrals: boolean;
  onListOnPublicChange: (v: boolean) => void;
  onListInternalChange: (v: boolean) => void;
};

type FormDefaultsProps = {
  mode: "formDefaults";
  compact?: boolean;
  listOnPublicJobBoard: boolean;
  listForInternalReferrals: boolean;
};

type Props = ControlledProps | FormDefaultsProps;

/**
 * Recruiter chooses whether a job is listed on the public board, internally (employees / org referrers), or both.
 */
/**
 * Compact variant: two toggle chips on one row, no heading and no prose.
 *
 * Two booleans were carrying a section label, a nested box, its own heading, an
 * intro paragraph and an explanation line each — ten lines of chrome for two
 * decisions, on a form a recruiter opens to change one field. The full
 * treatment is right the FIRST time someone publishes a job, which is the
 * wizard, and wrong every time after.
 *
 * The explanations survive as tooltips rather than being deleted.
 */
function Chip({
  on,
  label,
  title,
  input,
}: {
  on: boolean;
  label: string;
  title: string;
  input: React.ReactNode;
}) {
  return (
    <label
      title={title}
      className={`flex cursor-pointer items-center gap-2 text-[13px] transition ${
        on ? "text-[var(--text)]" : "text-white/45"
      }`}
    >
      {input}
      {label}
    </label>
  );
}

export function JobListingVisibilityFields(props: Props) {
  const pub = props.mode === "controlled" ? props.listOnPublicJobBoard : props.listOnPublicJobBoard;
  const internal =
    props.mode === "controlled" ? props.listForInternalReferrals : props.listForInternalReferrals;

  if (props.compact) {
    const box = "h-3.5 w-3.5 rounded border-[var(--border)]";
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
          Listed on
        </span>
        <Chip
          on={pub}
          label="Public job board"
          title="Anyone can discover this role on the public jobs page and in public refer-a-friend job pickers."
          input={
            props.mode === "controlled" ? (
              <input
                type="checkbox"
                className={box}
                checked={pub}
                onChange={(e) => props.onListOnPublicChange(e.target.checked)}
              />
            ) : (
              <input
                type="checkbox"
                name="listOnPublicJobBoard"
                className={box}
                defaultChecked={pub}
              />
            )
          }
        />
        <Chip
          on={internal}
          label="Internal job board"
          title="People in your company see this role when they refer candidates. Does not list the job for other companies."
          input={
            props.mode === "controlled" ? (
              <input
                type="checkbox"
                className={box}
                checked={internal}
                onChange={(e) => props.onListInternalChange(e.target.checked)}
              />
            ) : (
              <input
                type="checkbox"
                name="listForInternalReferrals"
                className={box}
                defaultChecked={internal}
              />
            )
          }
        />
        {props.mode === "controlled" && !pub && !internal ? (
          <span className="text-[11px] text-amber-400">Pick at least one to publish.</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={boxClass}>
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
          Where this job appears
        </h3>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
          Internal listings are visible only to your organisation (for example employees using Refer
          &amp; Earn). Public listings appear on the open job board. You can enable one or both.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        {props.mode === "controlled" ? (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--border)]"
            checked={pub}
            onChange={(e) => props.onListOnPublicChange(e.target.checked)}
          />
        ) : (
          <input
            type="checkbox"
            name="listOnPublicJobBoard"
            className="mt-1 h-4 w-4 rounded border-[var(--border)]"
            defaultChecked={pub}
          />
        )}
        <span>
          <span className={`${labelClass} mb-0`}>Public job board</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
            Anyone can discover this role on the public jobs page and in public refer-a-friend job
            pickers.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        {props.mode === "controlled" ? (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--border)]"
            checked={internal}
            onChange={(e) => props.onListInternalChange(e.target.checked)}
          />
        ) : (
          <input
            type="checkbox"
            name="listForInternalReferrals"
            className="mt-1 h-4 w-4 rounded border-[var(--border)]"
            defaultChecked={internal}
          />
        )}
        <span>
          <span className={`${labelClass} mb-0`}>Internal referrals</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
            People in your company (employees) see this role when they refer candidates. Does not
            list the job for other companies.
          </span>
        </span>
      </label>

      {props.mode === "controlled" && !pub && !internal ? (
        <p className="text-[11px] text-amber-400">
          Select at least one option to publish this job.
        </p>
      ) : null}
    </div>
  );
}
