-- Gate the Bolna AI voice-screening integration behind a runtime feature flag, default OFF.
--
-- Voice screening places outbound Bolna calls (per-minute platform COGS). This master switch
-- sits above the per-org `voice_screening_enabled` setting: while it is off, no Bolna call is
-- placed regardless of org-level configuration. Runtime checks use isEnabled('voice_screening_bolna').
--
-- ON CONFLICT DO NOTHING: introduce the flag as disabled, but never stomp a later operator
-- toggle if this migration is re-run.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'voice_screening_bolna',
  false,
  'Master switch for outbound Bolna AI voice-screening calls. Default OFF; sits above per-org voice_screening_enabled.'
)
ON CONFLICT (key) DO NOTHING;
