"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface PrivacySettingsFormProps {
  initialValues: {
    consentMessage: string;
    recordingRetentionDays: number;
    transcriptRetentionDays: number;
  };
  onSave: (values: {
    consentMessage: string;
    recordingRetentionDays: number;
    transcriptRetentionDays: number;
  }) => Promise<void>;
}

export function PrivacySettingsForm({ initialValues, onSave }: PrivacySettingsFormProps) {
  const [consentMessage, setConsentMessage] = useState(initialValues.consentMessage);
  const [recordingRetentionDays, setRecordingRetentionDays] = useState(
    initialValues.recordingRetentionDays,
  );
  const [transcriptRetentionDays, setTranscriptRetentionDays] = useState(
    initialValues.transcriptRetentionDays,
  );
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6">
      <div>
        <label className="mb-1 block text-xs text-[var(--text-muted)]">Consent message</label>
        <textarea
          rows={5}
          value={consentMessage}
          onChange={(e) => setConsentMessage(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Recording retention (days)
          </label>
          <input
            type="number"
            min={7}
            max={730}
            value={recordingRetentionDays}
            onChange={(e) => setRecordingRetentionDays(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-muted)]">
            Transcript retention (days)
          </label>
          <input
            type="number"
            min={30}
            max={1825}
            value={transcriptRetentionDays}
            onChange={(e) => setTranscriptRetentionDays(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({
              consentMessage,
              recordingRetentionDays,
              transcriptRetentionDays,
            });
          } finally {
            setSaving(false);
          }
        }}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : null}
        Save privacy settings
      </button>
    </div>
  );
}
