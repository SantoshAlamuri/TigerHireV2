# PII Retention Coverage

## Purpose

This document tracks retention-policy coverage for PII-bearing or identity-adjacent tables called out in the audit (`docs/audit-2026-04-18.md`). It is a doc-level control map, not a replacement for legal policy text.

## Runtime controls

- Org-level privacy settings are managed via `src/app/api/settings/privacy/route.ts`.
- Erasure execution is automated by `src/app/api/cron/privacy-retention/route.ts` and `CandidateService.eraseData(...)`.
- Audit/verification APIs are available under `src/app/api/compliance/*`.

## Table coverage map

| Table                              | PII/identity footprint                                           | Retention coverage note                                                                     | Current status |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| `agent_email_ingestion`            | Candidate/referrer email content                                 | Covered by org privacy retention + erasure workflow; keep only active processing artifacts  | Partial        |
| `candidate_profile_cache`          | Cached candidate profile attributes                              | Purged on candidate erasure (`CandidateService.eraseData`, PII-004) and cache rotation      | Implemented    |
| `jd_intel_cache`                   | Prompt/job text may include hiring contact details               | Keep minimal cache window; invalidate stale rows via privacy retention operations           | Partial        |
| `org_pipeline_stage_defaults`      | Internal workflow metadata; low direct PII                       | Keep while org is active; remove on org deletion/offboarding workflow                       | Partial        |
| `public.approval_tokens`           | Approval-link token metadata (identity-adjacent)                 | Token TTL and revocation policy applies; expired tokens should be cleaned                   | Partial        |
| `public.azure_group_role_mappings` | Group identifiers + role mapping metadata                        | Keep while SSO integration is active; remove on connector disconnect                        | Partial        |
| `public.blocked_public_domains`    | Domain-level anti-abuse list (potentially personal domains)      | Keep as long as abuse/compliance signal is active; periodic review required                 | Partial        |
| `public.company_sso_mappings`      | Org SSO domain/IdP mapping data                                  | Keep while SSO is enabled; remove on org disconnect or mapping rotation                     | Partial        |
| `public.fitscore_extraction_log`   | Resume/fit-score extraction traces may include candidate signals | Purged on candidate erasure (`CandidateService.eraseData`, PII-004); bound retention window | Implemented    |
| `public.hiring_request_code_seq`   | Sequence metadata only (low direct PII)                          | Keep as operational metadata; no special retention beyond org lifecycle                     | Implemented    |

## Next hardening pass

1. Add explicit retention durations per table family (candidate, integration, cache, token).
2. Add evidence tests that assert retention job behavior on representative PII tables.
3. Link this map to formal legal/privacy policy wording once finalized.
