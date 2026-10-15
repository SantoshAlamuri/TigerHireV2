"use client";

import { useId, useState } from "react";
import { useApiMutation } from "@/lib/hooks/use-api";
import { formatWhen, slotFromLocalInput, type OpenSlot } from "@/lib/work/interviews";
import s from "./interviews.module.css";

const SHOWN = 12;

/**
 * Choose one open time. When none fit, open a new one right here (POST
 * /api/jobs/[id]/availability, owned by you) instead of going to settings.
 */
export function SlotPicker({
  jobId,
  slots,
  value,
  onChange,
  onSlotsChanged,
  label,
}: {
  jobId: string;
  slots: OpenSlot[];
  value: string | null;
  onChange: (slotId: string) => void;
  onSlotsChanged: (createdId: string | null) => void | Promise<void>;
  label: string;
}) {
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(slots.length === 0);
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [localError, setLocalError] = useState<string | null>(null);
  const create = useApiMutation<
    { slots: { start_at: string; end_at: string; timezone: string }[] },
    { slots?: { id: string }[] }
  >(`/api/jobs/${jobId}/availability`, "POST");
  const ids = useId();

  const shown = more ? slots : slots.slice(0, SHOWN);
  const tz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  async function addSlot() {
    setLocalError(null);
    const slot = slotFromLocalInput(when, minutes, Date.now());
    if (!slot) {
      setLocalError("Pick a date and time in the future.");
      return;
    }
    const res = await create.mutate({ slots: [{ ...slot, timezone: tz ?? "Asia/Kolkata" }] });
    if (res) {
      setWhen("");
      setAdding(false);
      await onSlotsChanged(res.slots?.[0]?.id ?? null);
    }
  }

  return (
    <div className="wd-stack" style={{ gap: 12 }}>
      {slots.length > 0 ? (
        <>
          <span className="wd-small wd-muted" id={`${ids}-label`}>
            {label}
          </span>
          <div role="radiogroup" aria-labelledby={`${ids}-label`} className={s.slots}>
            {shown.map((slot) => (
              <button
                key={slot.id}
                type="button"
                role="radio"
                aria-checked={value === slot.id}
                className={s.slot}
                onClick={() => onChange(slot.id)}
              >
                {formatWhen(slot.start)}
                {slot.owner && <small>{slot.owner}</small>}
              </button>
            ))}
          </div>
          {slots.length > SHOWN && (
            <button type="button" className="wd-btn quiet" onClick={() => setMore((m) => !m)}>
              {more ? "Show fewer times" : `Show all ${slots.length} open times`}
            </button>
          )}
        </>
      ) : (
        <p className={s.notice}>No open times yet. Add one and it is offered straight away.</p>
      )}

      {adding ? (
        <div className={s.twoCols}>
          <label className={s.fieldGroup}>
            <span className={s.fieldHint}>Start</span>
            <input
              type="datetime-local"
              className="wd-input"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label className={s.fieldGroup}>
            <span className={s.fieldHint}>Length</span>
            <select
              className={s.select}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <div className="wd-row-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              type="button"
              className="wd-btn"
              disabled={create.loading || !when}
              onClick={() => void addSlot()}
            >
              {create.loading ? "Opening…" : "Open this time"}
            </button>
            {slots.length > 0 && (
              <button type="button" className="wd-btn quiet" onClick={() => setAdding(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="wd-btn quiet" onClick={() => setAdding(true)}>
            None of these work? Open another time
          </button>
        </div>
      )}
      {(localError || create.error) && (
        <p role="alert" className="wd-problem">
          {localError ?? create.error}
        </p>
      )}
    </div>
  );
}
