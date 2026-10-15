-- Seed runtime feature_flags so the full product is ON for everyone.
--
-- The Mumbai prod rebuild left public.feature_flags EMPTY. isEnabled() fails
-- CLOSED on missing rows (see src/lib/feature-flags.ts) — so core product
-- (hybrid FitScore v2, every agent, acknowledgements, offers, assessments,
-- SCIM, etc.) was silently DISABLED on prod. This contradicts the single-tier
-- "every customer gets the entire tool" model.
--
-- Values below replicate the proven-working config from the prior production
-- project (Sydney htdyomyhkvhcwoeodwas): 32 core flags ON, 6 experimental /
-- cost-variant flags OFF. ff_haiku_extraction stays OFF because CV-parse model
-- is controlled by the ANTHROPIC_CV_PARSE_MODEL env var instead.
--
-- Idempotent: ON CONFLICT updates enabled so re-running re-asserts the state.

INSERT INTO public.feature_flags (key, enabled, description, updated_by, updated_at) VALUES
  -- Core product — ENABLED for everyone
  ('ack_agency_bulk_enabled',        true,  'Candidate acknowledgement: agency bulk path',       'seed_full_tool', now()),
  ('ack_agency_single_enabled',      true,  'Candidate acknowledgement: agency single path',     'seed_full_tool', now()),
  ('ack_email_channel_enabled',      true,  'Candidate acknowledgement: email channel',          'seed_full_tool', now()),
  ('ack_email_intake_enabled',       true,  'Candidate acknowledgement: email intake path',      'seed_full_tool', now()),
  ('ack_logged_in_apply_enabled',    true,  'Candidate acknowledgement: logged-in apply path',   'seed_full_tool', now()),
  ('ack_notifier_enabled',           true,  'Candidate acknowledgement notifier',                'seed_full_tool', now()),
  ('ack_public_apply_enabled',       true,  'Candidate acknowledgement: public apply path',      'seed_full_tool', now()),
  ('ack_referral_pre_consent_enabled', true,'Candidate acknowledgement: referral pre-consent',   'seed_full_tool', now()),
  ('ack_whatsapp_channel_enabled',   true,  'Candidate acknowledgement: WhatsApp channel',       'seed_full_tool', now()),
  ('agents_run_global',              true,  'Global agent execution kill switch (on)',           'seed_full_tool', now()),
  ('assessments_global',             true,  'Assessments feature',                               'seed_full_tool', now()),
  ('circular_vouch_depth_3',         true,  'Vouch: depth-3 circular reference handling',        'seed_full_tool', now()),
  ('compensation_bands_global',      true,  'Compensation bands feature',                        'seed_full_tool', now()),
  ('consent_flow',                   true,  'Consent capture agent/flow',                        'seed_full_tool', now()),
  ('fitscore_batch_global',          true,  'FitScore batch scoring',                            'seed_full_tool', now()),
  ('fitscore_budget_enforcement',    true,  'FitScore batch budget guardrail',                   'seed_full_tool', now()),
  ('fitscore_hybrid_execution',      true,  'Hybrid execution in main FitScore path',            'seed_full_tool', now()),
  ('fitscore_hybrid_v2',             true,  'Hybrid FitScore v2 (JD base) — core scoring',       'seed_full_tool', now()),
  ('fitscore_prefilter_strict',      true,  'FitScore strict prefilter',                         'seed_full_tool', now()),
  ('ghostbuster_authenticity_agent', true,  'Fraud / authenticity agent',                        'seed_full_tool', now()),
  ('interview_prep_global',          true,  'Interview prep feature',                            'seed_full_tool', now()),
  ('offers_global',                  true,  'Offers feature',                                    'seed_full_tool', now()),
  ('orchestrator_agent_wiring_v1',   true,  'Orchestrator agent wiring v1',                      'seed_full_tool', now()),
  ('scheduler_agent',                true,  'Interview scheduler agent',                         'seed_full_tool', now()),
  ('scim_global',                    true,  'SCIM provisioning',                                 'seed_full_tool', now()),
  ('scoring_phase1_wiring',          true,  'Scoring phase-1 wiring',                            'seed_full_tool', now()),
  ('scoring_v2_primary',             true,  'Scoring v2 primary path',                           'seed_full_tool', now()),
  ('scoring_v2_shadow_enabled',      true,  'Scoring v2 shadow comparison',                      'seed_full_tool', now()),
  ('scout_agent',                    true,  'Candidate sourcing (scout) agent',                  'seed_full_tool', now()),
  ('verify_agent',                   true,  'Verification agent',                                'seed_full_tool', now()),
  ('vouch_agent',                    true,  'Vouch / reference agent',                           'seed_full_tool', now()),
  ('whatsapp_referral_consent_v2',   true,  'WhatsApp referral consent v2',                      'seed_full_tool', now()),
  -- Experimental / cost-variant — DISABLED (deliberate, matches prior prod)
  ('ff_cascade_rerank',              false, 'Experimental listwise rerank',                      'seed_full_tool', now()),
  ('ff_ctc_tiering',                 false, 'Experimental CTC-based model tiering',              'seed_full_tool', now()),
  ('ff_haiku_extraction',            false, 'CV-parse model is controlled by ANTHROPIC_CV_PARSE_MODEL env var instead', 'seed_full_tool', now()),
  ('ff_path_unification',            false, 'Experimental scoring path unification',             'seed_full_tool', now()),
  ('ff_structured_jd',               false, 'Experimental structured-JD extraction',             'seed_full_tool', now()),
  ('ff_whatsapp_gate',               false, 'WhatsApp prescreen gate (blocks scoring until answered)', 'seed_full_tool', now())
ON CONFLICT (key) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      description = EXCLUDED.description,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
