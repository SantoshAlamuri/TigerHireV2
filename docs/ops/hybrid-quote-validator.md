# Hybrid evidence quote validator

Model-independent fix for merged-path and explanation quote validation.

## Failure classes

1. **Substring mismatch** — whitespace / smart-quote drift between model quote and resume (`normalizeTextForMatch`, map-back to verbatim span).
2. **Paraphrase** — model returns `quote_anchor` (12–80 char exact snippet); server resolves the stored quote from the resume.
3. **Missing dimension** — fill with `NO_DEFENSIBLE_QUOTE` so scoring can proceed when evidence is absent.
4. **Overlong quote** — truncate at last word boundary ≤200 chars after resolution.

## Safety checks

- Normalized matches prefer spans that **overlap** the anchor / quote / `location_hint` intent region (avoids wrong duplicate occurrences in the CV).
- Truncation uses **word boundaries**, not raw character cuts.

## Code

- `src/lib/fitscore/hybrid/quote-validation.ts`
- Wired in `explanation.ts` and `extraction-and-verdict.ts` via `validateAndNormalizeEvidenceQuotes()`.

## Verify (QA Engineer job)

Re-run failing candidate IDs with flags **off** except path/haiku if measuring cascade cost; for validator-only proof, flags off is enough:

```bash
npx tsx scripts/validate-fitscore-cost-run.ts --job 861e8c58-9c72-4c46-8534-a02207a35cbc \
  --candidates 042917ab-6dfa-4b6f-bb39-f543518a16af,02b3bc38-0b20-4bd2-83bd-47e62653d8ef,ec1f3de1-e50b-4ebc-953d-caed297b6ada,1d4fdfc1-09fe-411a-985f-7a03bcf1c7ea,884b5d82-7dbd-4e43-b519-e3ac8a4adfa9,2edf5fb8-bbf9-4be9-937d-eb3346b0136b
```

Expect validation failures from substring/overlong to drop; missing-dimension → `NO_DEFENSIBLE_QUOTE` and scored rows where the model truly has no quote.
