/**
 * Runtime `feature_flags` key gating the Bolna AI voice-screening integration.
 *
 * Default OFF: voice screening (outbound Bolna calls) is disabled platform-wide unless an
 * operator flips this flag on. It sits ABOVE the per-org `voice_screening_enabled` setting —
 * when this is off, no Bolna call is placed regardless of any org-level configuration.
 */
export const FEATURE_FLAG_VOICE_SCREENING_BOLNA = "voice_screening_bolna";
