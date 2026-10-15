# Test fixtures

Place shared test data here so multiple tests can reuse it.

## Suggested contents (optional)

- **stripe/** – Sample Stripe webhook payloads (e.g. `checkout.session.completed.json`) for contract tests. Capture once from Stripe Dashboard or CLI, then commit.
- **claude/** – Sample Claude API responses for scoring/parsing tests.
- **whatsapp/** – Sample WhatsApp webhook payloads for ingest tests.

When adding fixtures, keep them minimal (redact PII and secrets) and document the source (e.g. "Stripe Dashboard → Developers → Webhooks → Send test webhook").
