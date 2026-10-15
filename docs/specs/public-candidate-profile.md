# Public Candidate Profile ("TigerCard") — Feature Spec v1

**Status:** Draft for operator review
**Date:** 2026-08-14
**Author:** Claude (spec-first, per operator request)
**Origin:** Competitor audit of cloudhire.ai "Cloud ID" (2026-08-14) — their landing page sells a candidate-owned, verified, shareable profile as the entire candidate-side value proposition. TigerHire has every underlying ingredient but exposes none of it to the candidate.

---

## Problem Statement

Candidates who go through TigerHire produce rich, verified signal — parsed skills, screening answers, vouches, verification claims — but get **no durable artifact** out of it. Everything lives behind the recruiter dashboard; the candidate has nothing to link from a LinkedIn bio, a WhatsApp status, or a job application elsewhere. This costs us twice: candidates have no reason to complete or maintain their profile (our profile-completion and claim rates suffer), and we have **zero candidate-side acquisition loop and zero indexable candidate content** while competitors (CloudHire "Cloud ID") make the shareable verified profile their entire candidate pitch.

## The one constraint that shapes everything

> **Nothing org-scoped may ever appear on a public profile.**

The codebase mapping (2026-08-14) established:

- Every rich score (`fit_scores.overall_score`, `band`, `verdict`, `ideal_match_pct`, `market_percentile`) is calibrated against **one org's JD Base and candidate pool** (`src/lib/fitscore/hybrid/market-score.ts` is explicitly org-scoped). Publishing one would leak that org's rubric and pool distribution.
- Assessments (`assessments`) and interview recordings (`interview_recordings`) are **org-owned rows** keyed to applications/pipelines, with org-only RLS. The Recall recording URL is an employer-side artifact. Consent-sensitive per DPDP.
- The apply-based access model is a **written product commitment**: migration `20260616133000_candidate_access_apply_based.sql` deliberately removed fit-score-based candidate access after cross-org matching leaked. Raw `fit_scores` rows would also reveal _which orgs silently matched a candidate pre-apply_.
- Internal risk scores (`trust_score`, `ghost_risk_score`, `intent_score`, `fraud_score`, `human_signal*`) are candidate-intrinsic but **derogatory-capable** — never publishable.

**Therefore:** the public profile is built exclusively from (a) candidate-authored content, (b) candidate-intrinsic verification assets (`verifications.badge`, `verification_claims` with `status='confirmed'`, `vouches`), and (c) — in Phase 2 — a **new candidate-owned assessment** built for publication. CloudHire's "82/100 against LLM Evaluation" is copied in _shape_, not in _data source_.

---

## Goals

1. **Candidate activation:** ≥40% of candidates who claim their profile (via the existing `/claim/[token]` flow) publish a public profile within 14 days of the feature being offered.
2. **Acquisition loop:** ≥15% of unique public-profile visitors click through to a TigerHire surface (register, jobs, apply) within 90 days of launch.
3. **Profile completeness:** candidates with a published profile have ≥2× the field-completeness of unpublished ones (the artifact motivates the upkeep).
4. **Zero cross-tenant leakage:** no org-scoped datum ever renders on a public profile — enforced by whitelist + tests + CI, not by review vigilance.

## Non-Goals (v1)

1. **No public candidate directory or search.** Profiles are reachable only by their URL. No browse page, no enumeration endpoint, no "talent from leading companies" wall. (Preserves the apply-based model; prevents scraping TigerHire into a sourcing database.)
2. **No org fit scores, market ranks, verdicts, or assessment results on the profile** — see the constraint above. Not even anonymised ("scored against 12 startup JDs") in v1; that aggregation needs its own privacy review.
3. **No public contact details.** No phone, no email, ever — a "request intro" relay is P2. `linkedin_url`/`github_url`/`portfolio_url` are candidate-toggleable.
4. **No employer-side controls.** Orgs get no say over a candidate's public profile (it contains nothing of theirs). Avoids building an approval workflow nobody asked for.
5. **No interview-recording playback.** Recall recordings are employer artifacts with two-party-consent exposure. The Phase 2 video story is the dormant 60-second self-intro (`verification-videos` bucket), which is candidate-authored by construction.

---

## User Stories

**Candidate (primary persona — `candidate_free`/`candidate_pro`)**

- As a candidate, I want a stable public URL showing my verified skills and badges so that I can link it from LinkedIn/WhatsApp and stand out from unverified resumes.
- As a candidate, I want explicit control over publishing (default OFF, one-click unpublish, section toggles) so that going public is my decision, reversibly.
- As a candidate, I want to see how many times my profile was viewed so that I have a reason to return and improve it.
- As a candidate who applied via WhatsApp and never created an account, I want the claim link I already received to lead me to profile ownership so that publication is gated on authenticated ownership (claim ≠ publish).
- As a candidate exercising DPDP rights, I want erasure to remove the public profile immediately so that my data stops being world-readable the moment I ask.

**Profile visitor (recruiter at any company, or anyone with the link)**

- As a visitor, I want to see which claims are _verified by TigerHire_ vs self-reported so that the badge actually means something.
- As a visitor, I want an obvious path to TigerHire ("Hire verified talent" / candidate CTA) so that the profile works as an acquisition surface.

**Edge cases**

- Unpublished/unknown/erased slug → identical 404 (no existence oracle).
- Candidate deletes account → profile 404s within one request cycle (no cache stampede window beyond CDN TTL).
- Candidate with zero verified assets → profile renders honestly (identity + self-reported sections, no counterfeit "verified" styling).

---

## UX Outline

- **URL:** `tigerhire.io/p/[slug]` — new top-level path. Not under `/candidate/` (blanket-disallowed in `robots.ts`, role-gated prefix in `dashboard-route-policy.ts`) and not under `/candidates` (existing marketing page; the route-policy matcher explicitly distinguishes the two).
- **Slug:** candidate-chosen, validated `^[a-z0-9-]{3,40}$`, unique, mutable (old slug 404s — we do not maintain redirect history in v1), profanity/reserved-word denylist (`admin`, `api`, `jobs`, …).
- **Page sections (all candidate-toggleable):** identity header (name, headline, location, availability, avatar) · verification badge (bronze/silver/gold from `verifications.badge`) · verified claims (`verification_claims` where `status='confirmed'`) · skills (`candidates.skills`) · experience summary (`experience_years`, `current_role`, `current_company`, `seniority_level`) · vouches (v1: **count + relationship types only**, no text — see Open Q3) · external links · "Powered by TigerHire" footer CTA.
- **Candidate management UI:** new section in `(dashboard)/candidate/profile` — publish toggle, slug picker, section toggles, live preview, view count.
- **Theme/OG:** house `(public)` layout; static OG image in v1 (per-candidate OG cards are P2 — OG images are unauthenticated + CDN-cached, so they're their own PII decision).

---

## Requirements

### P0 — cannot ship without

**P0-1. Schema (one migration, review-only until approved):**
`candidates` gains `public_profile_enabled boolean NOT NULL DEFAULT false`, `public_slug text UNIQUE`, `headline text`, `public_bio text`, `avatar_path text`, `public_sections jsonb NOT NULL DEFAULT '{}'`, `public_profile_published_at timestamptz`. **Deliberately distinct from `candidates.visibility`** (which feeds `match_candidates` in-platform matching — overloading it would silently republish everyone already marked visible). New private storage bucket `candidate-avatars` keyed on candidate UUID folder, mirroring `candidate-cvs` policies; avatars served via signed URL re-signed server-side into the public payload.

- ✓ Migration applies cleanly to a shadow DB; `visibility` semantics untouched (regression test on `match_candidates`).

**P0-2. Consent (new type, written to `consent_records`):**
New consent type `public_profile_publication`. The publish toggle writes a `consent_records` row (`consent_given=true`, `obtained_via='web_form'`, full `consent_text`, IP) via `ConsentService`; unpublish writes a revocation row. Publication is blocked unless this consent row exists. Consent text needs DPDP review (the existing recruiter-submitted text is itself still flagged DRAFT in-code — see `src/lib/consent/record-intake-consent.ts`).

- ✓ Given a candidate without the consent row, when the public route is hit for their slug, then 404 — even if `public_profile_enabled=true` was set by any other path.

**P0-3. Public read API — the whitelist IS the boundary:**
`GET /api/public/profiles/[slug]` under the `/api/public/` middleware prefix (already session-skipping in `src/proxy.ts`). Follows the `PUBLIC_JOB_COLUMNS` house pattern exactly: service-role client + `PUBLIC_CANDIDATE_PROFILE_COLUMNS` const whitelist + publication predicates (`public_profile_enabled=true` AND consent row exists AND `erased_at IS NULL` AND `user_id IS NOT NULL` — only claimed profiles publish) + typed response object (never a row spread). **Must-never-leak list documented in the const's comment:** `email`, `phone`, `cv_url`, `cv_raw_text`, `resume_url`, `salary_expectation_*`, `trust_score`, `ghost_risk_score`, `intent_score`, `fraud_*`, `human_signal*`, `profile_embedding`, `entry_path`, `signal_sources`, `referred_by`, `external_id`, `claim_token*`. Joins limited to: `verifications.badge`, confirmed `verification_claims`, vouch aggregate counts.

- ✓ Unit test asserts the response type's key set against an explicit allowlist snapshot (any new key fails the test — the same ratchet philosophy as the LLM-schema guardrails).
- ✓ Unknown, unpublished, unclaimed, and erased slugs return byte-identical 404 bodies.
- ✓ `Cache-Control: public, max-age=300` (leaderboard precedent) — and unpublish tolerates ≤5-minute CDN staleness, documented in the UI copy ("may take a few minutes to disappear").

**P0-4. Page:** `(public)/p/[slug]/` — thin server `layout.tsx` with `generateMetadata` (canonical `/p/[slug]`, noindex when 404, title "Name — Headline | TigerHire") + client page fetching the public API. House pattern from `jobs/[id]`.

**P0-5. Candidate publish/manage API:** `PATCH /api/profiles` extension (existing `ProfileService` writes the `candidates` row already): slug claim (uniqueness race-safe via the DB unique constraint, not a pre-check), publish/unpublish, section toggles, headline/bio, avatar upload (size/type-limited, `publicForm` rate-limit preset). `validateOrigin()` on all mutations per the CSRF convention.

- ✓ Zod schema on every field; bio length-capped; slug regex + denylist enforced server-side.

**P0-6. Abuse controls:** layered rate limits on the public read (per-IP/min + per-IP/day + **global daily cap** with distinct warn log, modeled on `demo/score`); fails closed like all `checkRateLimit` paths. Slug mutation limited (e.g. 5/day/candidate) to prevent slug-cycling abuse.

**P0-7. Routing/crawler plumbing (explicit edits, each currently blocking):** `src/proxy.ts` public prefixes (`/api/public/profiles`), `robots.ts` (nothing to add — `/p/` is not disallowed; add a comment marking it deliberately crawlable), `scripts/audit-api-routes.mjs` `PUBLIC_MUTATION_ALLOWLIST` if the view-counter POST ships (P1).

**P0-8. Erasure integration:** `/api/candidates/erasure` flow also clears `public_profile_enabled`, `public_slug`, avatar object, and writes the consent revocation. Erasure test covers the public route 404ing afterward.

**P0-9. Feature flag:** `public_candidate_profile` seeded **OFF** by migration (`ON CONFLICT DO NOTHING` per convention); flag checked in the public route and the manage UI. Global-OFF → nothing reachable even if rows are configured.

### P1 — fast follow

- **P1-1. Server-side view counter:** `POST /api/public/profiles/[slug]/view` incrementing `view_count`/`first_viewed_at`/`last_viewed_at` (offer-view precedent), CSRF-allowlisted, heavily rate-limited, **no viewer IP stored** (the privacy policy states IPs are anonymised). Surfaced in the candidate manage UI. PostHog stays the consent-gated client-side layer; the counter is the source of truth.
- **P1-2. Indexability + sitemap:** flip `/p/` pages to indexable and append published slugs to `sitemap.ts` (mirroring the public-API predicates exactly, inside the 5000 cap — same mirroring discipline as jobs). **Launch is link-only/noindex; indexing is a deliberate second switch** (Open Q4).
- **P1-3. Share affordances:** copy-link + WhatsApp share + LinkedIn "Add to profile" deep link from the manage UI; share events tracked (consent-gated).
- **P1-4. Claim-flow handoff:** post-claim success screen offers "publish your TigerCard" (the claim link from `/apply` post-apply screen is the top of this funnel).

### P2 — architectural insurance (design for, don't build)

- **P2-1. Candidate-owned public assessment:** a new candidate-intrinsic skill assessment (not `assessments`, which is org-owned) whose score is _built for publication_ — this is the legitimate version of CloudHire's "82/100". Separate spec; the `public_sections` jsonb reserves the section key now.
- **P2-2. 60-second video intro:** revive the dormant `verification-videos` bucket/`verifications.step_1_video_url` write path; candidate-recorded, candidate-owned, served via signed URL with short TTL. Reserves section key now.
- **P2-3. Request-intro relay:** visitor → candidate contact without revealing contact details (`access-audit` hooks exist if it ever reveals PII).
- **P2-4. Per-candidate OG cards** (`next/og`; only precedent is the favicon) — needs its own PII sign-off.
- **P2-5. Vouch text display** with voucher consent (see Open Q3).

---

## Success Metrics

**Leading (first 30 days after flag-on):** publish conversion (published / claimed, target 40%), slug-claim errors, section-toggle usage, share-link copies, public-route 404-vs-200 ratio (enumeration-probe canary), rate-limit hit counts.
**Lagging (quarter):** visitor→signup conversion (target 15% CTR to TigerHire surfaces; UTM-tagged CTA), profile-completeness delta published vs not (target 2×), organic impressions for `/p/` (only after P1-2), claim-rate movement on the `/apply` funnel.
**Measurement:** PostHog (consent-gated) + the server-side view counter + a weekly SQL rollup; evaluate at 2 and 6 weeks.

## Rollout

1. Migration review → apply to **preview Sydney only**; build behind `public_candidate_profile` global-OFF.
2. Verify-as-role pass on preview (per the standing "verify twice or thrice" rule): as candidate (publish/unpublish/toggles/erasure), as recruiter (nothing new visible in-app), as anon (only whitelisted payload; probe the must-never-leak list; identical 404s).
3. Flag ON for an internal test org candidate on preview → soak → prod migration approval → prod flag-on for a handful of real candidates (Masai cohort is the obvious pilot) → general.

## Open Questions

- **Q1 (operator — blocking for P0-2 text):** DPDP review of the `public_profile_publication` consent text. Who signs off? (The recruiter-submitted consent text is already flagged DRAFT in-code; this adds a second pending text.)
- **Q2 (operator — ratify):** the score-disclosure policy above (no org-scoped data, ever; candidate-intrinsic-only; risk scores never). The spec assumes yes; everything downstream depends on it.
- **Q3 (operator/product):** vouches on the public page — v1 shows count + relationship types only, because vouch text was written for an in-platform audience and vouchers never consented to public display. OK, or drop vouches from v1 entirely?
- **Q4 (operator):** flip to indexable at P1-2, or stay link-only longer? Indexable = SEO upside + candidate names in Google (with their consent, but worth an explicit call).
- **Q5 (engineering — non-blocking):** slug-change behavior — v1 lets old slugs 404; do we want a `previous_slug` redirect within e.g. 30 days? (Cheap column; decide before v1 ships to avoid a migration later.)
- **Q6 (design — non-blocking):** does the profile page adopt the v2 design-system primitives (`src/components/v2`) or the `(public)` marketing look? Recommend v2 primitives for product-consistency; needs a v2-spec-extract entry to stay inside the conformance ratchet.

## Timeline Considerations

No hard deadline. Natural sequencing: P0 is one engineer-week-scale build (schema + one public route + one page + manage UI extension), and **the consent text (Q1) is the long pole** — start the DPDP review immediately, build in parallel. P1-2 (indexing) should wait for at least 2 weeks of link-only soak. P2-1 (public assessment) is a separate spec and the real differentiation; do not let it creep into this build.

---

_Codebase references throughout are from the 2026-08-14 mapping (two Explore agents) against dev @ c0f8a6a9; re-verify file paths if implementing much later._
