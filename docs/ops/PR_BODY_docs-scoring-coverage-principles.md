# PR title (copy to GitHub)

```
docs: scoring coverage principle, audit, Dimensions Ontology BRD
```

# PR description (copy to GitHub)

## Summary

- **Principle:** [`docs/principles/scoring-coverage.md`](../principles/scoring-coverage.md) — single scoring stack across apply surfaces; canonical `scoreCandidateForJob`-style entry point; agency bulk exception documented.
- **Audit:** [`docs/principles/scoring-coverage-audit-2026-05.md`](../principles/scoring-coverage-audit-2026-05.md) — surface-by-surface state vs principle; gap counts; parked ticket stubs **TH-SCORING-1–TH-SCORING-4** (queued, **gated on ledger acceptance**).
- **BRD:** [`docs/brds/README.md`](../brds/README.md) + [`docs/brds/dimensions-ontology.md`](../brds/dimensions-ontology.md) — Dimensions Ontology BRD imported for version control (see HTML comment at top of BRD for conversion notes).
- **Tracker:** [`docs/ops/parked-work.md`](./parked-work.md) — TH-SCORING-1–4, Vision fallback investigation, BRD import row.

## Queued work (do not start until ledger acceptance)

**TH-SCORING-1** through **TH-SCORING-4** — migrate WhatsApp callers, fix email intake, cleanup dead code, agency bulk invariant (see audit memo).

## Checklist

- [ ] Self-merge after review (solo) once CI/doc checks are green.
