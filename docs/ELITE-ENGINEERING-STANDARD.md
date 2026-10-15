# Elite Engineering Standard v1.0

**Status:** Retained for narrative pillars and history. **For anything enforced in CI (lint, typecheck, `npm run validate`, `npm run gate`, size checks), use [ELITE-ENGINEERING-STANDARD-V2.md](./ELITE-ENGINEERING-STANDARD-V2.md) as the only source of truth.** Do not duplicate v2 rules here.

**Target:** 90+ on all metrics | Maintainable | Production-ready  
**Golden rule:** Code is read 10x more than written. Optimize for the next developer's cognitive load.

**Tool-enforced version:** [ELITE-ENGINEERING-STANDARD-V2.md](./ELITE-ENGINEERING-STANDARD-V2.md) — automated validation (ESLint, Prettier, `npm run gate`, validate/size-check scripts, CI).

---

## Standard pillars

1. **Performance & speed** — 95+ Lighthouse; O(n log n) or better; multi-tier caching; &lt;200KB initial JS; workers for CPU-heavy work.
2. **Code quality & architecture** — SOLID; clean layers; 100% TypeScript strict; &gt;90% unit, &gt;80% integration coverage; JSDoc + ADRs.
3. **Security & reliability** — Zod at boundaries; structured logging; no secrets in code; circuit breakers; dependency audits.
4. **Developer experience** — Clone + install + dev in &lt;5 min; ESLint + Prettier + Husky; conventional commits; fast HMR.
5. **Scalability & ops** — 99.9% uptime; observability (metrics, logs, tracing); IaC; DB indexing, pooling, read replicas.

---

## Outputs (required artifacts)

| Artifact                  | Location                                                           | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Code review checklist** | [ELITE-CODE-REVIEW-CHECKLIST.md](./ELITE-CODE-REVIEW-CHECKLIST.md) | Self-review before every PR; gate merge on required items.          |
| **Performance report**    | [ELITE-PERFORMANCE-REPORT.md](./ELITE-PERFORMANCE-REPORT.md)       | Benchmarks, bundle/cache status, before/after template; CI budgets. |
| **Architecture (C4)**     | [ARCHITECTURE-C4.md](./ARCHITECTURE-C4.md)                         | Context → Container → Component → Code; Mermaid diagrams.           |
| **Tech debt log**         | [TECH-DEBT-LOG.md](./TECH-DEBT-LOG.md)                             | Prioritized backlog (P1–P4 + Elite); every item ticket-tracked.     |

---

## How to run the rating

**Not a coder?** See [HOW-TO-RUN-THE-RATING.md](./HOW-TO-RUN-THE-RATING.md) for step-by-step instructions and a plain-English explanation of the results.

Run the Elite Standard audit against the codebase and get an overall score (0–100) plus per-pillar scores:

```bash
npm run rate
```

- **Options:** `--skip-coverage` (faster; skips test:coverage), `--fail-under=N` (exit 1 if overall &lt; N), `--json` (output machine-readable JSON), `--output=path` (write markdown report to path, e.g. `docs/ELITE-RATING-REPORT.md`).
- **Target:** 90+ = Elite. Use `npm run rate:ci` (or `--fail-under=70`) in CI to fail the build when the score drops below a threshold.

---

## Constraints

- No premature optimization without profiling data.
- No over-engineering: simplest solution that meets 90+ targets.
- No tech debt without a ticket for repayment.

---

## Related docs

- [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md) — Detailed code review findings and fixes.
- [PRODUCTION-READINESS-AUDIT.md](./archive/2026-q1-q2/PRODUCTION-READINESS-AUDIT.md) — Security, config, testing audit.
- [ADR index](./adr/README.md) and root `ADR-*.md` — Architecture decisions.
