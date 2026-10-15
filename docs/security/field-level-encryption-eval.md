# Application-Level Field Encryption for Candidate PII — Decision Record (PII-007)

**Status:** Decided — **Defer** (do not implement column-level encryption for
candidate PII now). Revisit if a regulatory or contractual requirement forces it.

**Date:** 2026-06-16

## Question

Should the most sensitive candidate fields (`candidates.email`, `phone`,
`cv_raw_text`) be encrypted at the application layer (AES-256-GCM, like the
secrets in `src/lib/security/credentials-encryption.ts`) in addition to
Supabase's platform at-rest encryption?

## Current protection (baseline)

- **At rest:** Supabase/Postgres disk encryption (platform-managed).
- **In transit:** TLS.
- **Access control:** RLS (tenant isolation), unlock-gated masking
  (`src/lib/security/pii.ts` `maskCandidateForShortlist`), short-lived signed
  resume URLs, access auditing (`access-audit.ts`), DSAR export + erasure.

Secrets/integration tokens already use app-level AES-256-GCM because they are
high-value and are never queried/searched — encryption has no functional cost
there.

## Why column encryption is costly for candidate PII

Candidate `email` / `phone` / `cv_raw_text` are not write-only secrets; they are
queried, matched, and searched throughout the product:

1. **Search / lookup / dedup** — email & phone are used for candidate dedup
   (`candidate-dedup`), WhatsApp phone matching, and lookups. Deterministic
   equality search on encrypted columns requires deterministic encryption or a
   blind-index/HMAC scheme — extra schema, key management, and migration.
2. **CV text → FitScore** — `cv_raw_text` feeds the FitScore extraction
   pipeline and embeddings. Encrypting it means every scoring/extraction read
   decrypts in app code, adding latency and key-handling surface to a hot path.
3. **Masking already exists** — recruiters see masked contact info until an
   audited, credit-metered unlock. The primary exposure (over-broad recruiter
   visibility) is already mitigated at the access layer, not the storage layer.
4. **Key management** — a column-encryption scheme needs a managed key (KMS or
   env secret), rotation, and a re-encryption migration path. That operational
   burden is only justified by a threat model where the DB is read but RLS +
   platform encryption are both bypassed.

## Threat model assessment

App-level column encryption primarily defends against an attacker who obtains
raw table data **without** the application key (e.g. a leaked DB dump, a
misconfigured read replica, or insider DB access). For TigerHire's current
posture — managed Supabase, RLS-enforced tenant isolation, no shipped raw dumps
— that incremental threat is low relative to the functional cost.

## Decision

**Defer.** Keep relying on platform at-rest encryption + RLS + unlock masking +
signed URLs + auditing. Do **not** add column-level encryption for candidate
PII at this time.

## Triggers to revisit (open an implementation ticket if any becomes true)

- A regulation/contract (e.g. a specific DPDP/GDPR clause or enterprise customer
  DPA) mandates field-level encryption of candidate contact data.
- TigerHire begins exporting/replicating raw DB data to environments outside the
  managed Supabase trust boundary.
- A move to self-hosted Postgres without equivalent platform at-rest guarantees.

If adopted, scope the implementation ticket to: a blind-index for
email/phone equality search, decrypt-on-read in the FitScore pipeline, key
management + rotation, and a backfill/re-encryption migration.
