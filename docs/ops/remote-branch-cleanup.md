# Remote branch cleanup

**Last audit:** 2026-06-10  
**Cleanup executed:** 2026-06-10 — **103 delete-safe remotes removed** (0 failed). **29 remotes remain** (`main`, `dev`, `claude/idibu-integration` restored, + 25 with unmerged work).  
**`origin/dev` / `origin/main` tip:** `fa4bc1f6` (2026-06-10 05:06:42 +0100)

Stale remote branches are **GitHub clutter only** — they do not affect production deploys. Only `main` (and preview branches from open PRs) matter for Vercel.

## Caveats (read before deleting)

### Open PRs — `claude/idibu-integration`

Do **not** delete even when git reports 0 commits ahead of `dev`. Commit `c9512403` is already on `dev`/`main`, but the branch keeps an **open PR** alive while idibu sandbox credentials are pending. The bulk cleanup removed this remote by mistake; it was **restored** with:

```bash
git push origin claude/idibu-integration:claude/idibu-integration
```

The script pins this branch in `NEVER_DELETE`.

### Migrations on `dev` but not yet applied to DB

These files are on **`origin/dev`** (and `main`) — safe to delete the _feature branch_ they came from, **not** safe to drop from git:

| Migration                                                      | On `dev`?        | Staging/prod DB                 |
| -------------------------------------------------------------- | ---------------- | ------------------------------- |
| `20260604150000_prescreen_per_channel_gate.sql`                | Yes (`4256fe31`) | Apply before enabling prescreen |
| `20260604160000_ensure_org_runtime_feature_flag_overrides.sql` | Yes (`5dc3197d`) | Apply before org flag overrides |

Branch deletion does not remove migrations from `dev`. Missing DB apply is a separate ops step.

## Criteria

| Label            | Rule                                                       | Action                                                  |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| **Delete-safe**  | `git rev-list --count origin/dev..origin/<branch>` = **0** | Work already on `dev` — pointer-only cleanup            |
| **Keep**         | Count **> 0**                                              | Commits exist nowhere on `dev` — review before deleting |
| **Pinned**       | In `NEVER_DELETE` in script                                | Open PR / blocked — never bulk-delete                   |
| **Never delete** | `main`, `dev`                                              | Integration / production branches                       |

Manual equivalent:

```bash
git fetch --prune
git branch -r --merged origin/dev      # delete-safe (when BASE=origin/dev)
git branch -r --no-merged origin/dev   # keep — check each
```

```bash
./scripts/git-delete-merged-remote-branches.sh --list
```

Delete merged remotes (after reviewing list):

```bash
./scripts/git-delete-merged-remote-branches.sh --execute        # prompts y/N
./scripts/git-delete-merged-remote-branches.sh --execute --yes  # non-interactive
```

## Production deploy check

After promoting `dev` → `main`, confirm Vercel Production shows commit `fa4bc1f6`:

1. Vercel dashboard → Project → Deployments → Production
2. Or: `git log -1 origin/main` should match the production deployment SHA

Cascade V3 code is on `main` (PR #81) but **all `ff_*` cascade flags are OFF** in prod — live scoring uses hybrid v2 Sonnet until flags are enabled deliberately.

---

## Branches to KEEP (25 — not merged into `dev`)

These have commits **not** on `dev`. Do not bulk-delete.

| Ahead | Behind | Branch                                                    |
| ----- | ------ | --------------------------------------------------------- |
| 1     | 186    | `chore/ia-landing-label-cleanup`                          |
| 2     | 88     | `claude/agency-upload-background-scoring`                 |
| 5     | 143    | `claude/brief-11-plan-first-hiring`                       |
| 6     | 145    | `claude/fix-nav-role-routing`                             |
| 1     | 65     | `claude/fix-proxy-only`                                   |
| 1     | 81     | `claude/fix-source-attribution`                           |
| 1     | 69     | `claude/tigerhire-tryout-backend`                         |
| 1     | 68     | `claude/tryout-middleware-fix`                            |
| 1     | 192    | `cursor/company-team-spacing-80df`                        |
| 1     | 216    | `cursor/critical-bug-inspection-2ff1`                     |
| 2     | 281    | `cursor/critical-bug-inspection-92d9`                     |
| 2     | 263    | `cursor/critical-bug-inspection-c44b`                     |
| 1     | 309    | `cursor/critical-bug-inspection-e85e`                     |
| 1     | 192    | `cursor/page-header-rhythm-80df`                          |
| 1     | 192    | `cursor/remove-topnav-utility-secondary-80df`             |
| 1     | 98     | `dependabot/github_actions/actions/checkout-6`            |
| 1     | 98     | `dependabot/github_actions/actions/setup-node-6`          |
| 1     | 50     | `dependabot/github_actions/gitleaks/gitleaks-action-3`    |
| 1     | 313    | `dependabot/github_actions/softprops/action-gh-release-3` |
| 1     | 12     | `dependabot/npm_and_yarn/development-4f8fa93b57`          |
| 1     | 12     | `dependabot/npm_and_yarn/production-7004ddbc8a`           |
| 1     | 185    | `feat/nav-registry-phase-2`                               |
| 2     | 296    | `feature/merge-extraction-verdict`                        |
| 1     | 186    | `fix/brief1-leadership-signup-org-admin`                  |
| 1     | 281    | `fix/verdict-ui-cleanup`                                  |

---

## Delete-safe branches (103 — removed 2026-06-10)

These were fully contained in `main` and have been deleted from GitHub. Re-run `--list` after future merges to find new delete-safe branches.

<details>
<summary>Historical list — deleted branches (click to expand)</summary>

```
ack/pr-0a-foundation
backup/pre-reset-fee4dd8
brief-1-and-pr-d-cleanup
chore/cherry-pick-costs-ui-attribution
chore/sync-screening-and-workflow-docs
claude/agency-unified-pipeline
claude/audit-scoring-fixes-Muohf
claude/brief-11-phase-c-auto-execution
claude/brief-12-top-nav-simplification
claude/brief-4-nav-resolver-consolidation
claude/brief-7-locale-pass
claude/brief-8-phase-c-scheduling
claude/brief-9-referral-campaigns-scope-2
claude/brief3-org-admin-toggle-phase-3
claude/brief3-settings-dedup-phase-2
claude/brief3-setup-phase-1
claude/calendar-create-slots-foundation
claude/card-signals-filters-overview
claude/cascade-v3-scoring
claude/center-align-hireability-table
claude/centralize-model-config-and-deprecation-check
claude/ci-audit-gate-and-determinism-runbook
claude/compact-candidate-stage-timeline
claude/compact-hireability-summary
claude/confident-thompson-f3d6ca
claude/docs-sweep-tier1-and-archive
claude/docx-parse-scoring-docs
claude/fit-score-jd-base-lineage
claude/fitscore-cost-dedupe-guards
claude/fix-auth-page-loading-dTOG8
claude/fix-consent-button-tap
claude/fix-counter-offer-semantics
claude/fix-email-auth-validation-tMXIK
claude/fix-image-shadow-score-LeYY5
claude/fix-incomplete-tabs-WuWzR
claude/fix-next-cves-and-tech-debt-log
claude/fix-otp-copy-code-button-format
claude/fix-referrer-otp-button-params
claude/fix-remaining-test-failures
claude/fix-upload-scoring-performance-jOyRk
claude/fix-whatsapp-apply-pick-flow
claude/gap-backlog-status-corrections
claude/go-no-go-jun-2026
claude/hireability-summary-table
claude/hiring-request-recruiter-ux
claude/hotfix-friendly-font
claude/idibu-integration
claude/interviewer-identity-v1
claude/jd-wizard-fitscore-blend-v2
claude/launch-readiness-final
claude/launch-readiness-fixes
claude/launch-readiness-followup
claude/nav-reorder-workflow-order
claude/pending-easy-wins
claude/per-org-flag-overrides
claude/phase2-oauth-live-validation
claude/pipeline-card-layout-optimization
claude/plan-assessment-auto-send
claude/plan-pilot-hardening
claude/plan-task-email-and-stage-sync
claude/post-cve-tech-debt-and-evidence-sweep
claude/prescreen-per-channel-gate
claude/recruit-assessments-hiring-batch
claude/refer-join-city-suggestions-by-country
claude/review-system-qCtAz
claude/scheduling-calendar-self-serve
claude/screening-v1-whatsapp-call-guard
claude/security-middleware-hardening
claude/seed-qa-engineer-candidates
claude/sentry-client-v10-migration
claude/settings-reusable-module
claude/setup-mode-complete
claude/soft-launch-prep
claude/spacing-pass-dashboard-pages
claude/stability-regression-perf-tests
claude/th-scoring-1-whatsapp-message-path
claude/th-scoring-3-dead-code-cleanup
claude/tryout-cv-speed-insights
claude/tryout-trim-redundant-insight
claude/uat-ux-cleanup-pass
claude/whatsapp-strategic-refactor
claude/whatsapp-template-audit
cursor/development-environment-setup-11aa
cursor/email-registration-supabase-859f
cursor/functional-performance-testing-cbea
cursor/post-merge-security-check-7885
cursor/post-merge-security-check-a1dd
experiment/201d2bc-baseline
feat/billing-costs-llm-attribution-usage-meters
feat/nav-phase-3-pr-1-cleanup-and-fixes
feat/nav-phase-3-pr-2-pr-3
feat/nav-registry-phase-1
feat/referral-flow-hardening
feature/retire-orchestrator-hiring-templates-pipeline
feature/tryout-jd-extract-qa-ops-scripts
feature/whatsapp-template-management-v6
feature/whatsapp-typing-mobile-nav-soak
fix/hybrid-quote-validator
fix/plan-assessment-client-boundary
fix/referral-outreach-without-open-jobs
fix/scoring-legacy-cleanup
fix/verdict-ui-dedup
fix/verdict-ui-phase1
origin
```

</details>
