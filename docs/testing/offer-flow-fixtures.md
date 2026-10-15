# Offer Flow Test Fixtures

Use this seed to generate end-to-end offer workflow data for all major cases:

- normal draft -> approve -> send
- pending finance -> approve
- pending finance -> reject
- candidate counter -> back to finance
- withdrawn offer
- accepted/signed offer

## Prerequisites

- `NEXT_PUBLIC_SUPABASE_URL` set
- `SUPABASE_SERVICE_ROLE_KEY` set
- Target organisation has at least one profile each for:
  - company admin
  - recruiter
  - hiring manager
  - finance

## Run

```bash
TEST_ORG_SLUG=razorpay node scripts/seed-offer-flow-fixtures.mjs
```

Or target directly by org id:

```bash
TEST_ORG_ID=<org-uuid> node scripts/seed-offer-flow-fixtures.mjs
```

## Seeded Cases

After running, the script prints offer IDs for:

1. Normal draft
2. Pending finance (approve path)
3. Pending finance (reject path)
4. Candidate counter (already back in pending finance)
5. Withdrawn after send
6. Accepted + signed

It also seeds:

- linked requisitions (`hiring_requests`)
- jobs linked to requisitions (`jobs.hiring_request_id`)
- candidates + applications
- pipeline stage/candidate rows
- compensation band
- role permission settings including multi-calculator offer flow defaults

## Suggested Verification Path

1. Open `/company/offers` and confirm flow thread appears on each seeded row.
2. Open `/company/finance` and process pending finance cases.
3. Send an approved offer and verify candidate-facing state changes.
4. Check audit timeline on each offer row.
