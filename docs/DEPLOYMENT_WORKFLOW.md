# Deployment Workflow

This document describes the automated deployment workflow for TigerHire.

## Branch Strategy

- **`dev`** — Development branch for active work. All new features and fixes go here first.
- **`main`** — Production branch. Only tested, production-ready code should be here.

## Workflow Overview

```
Feature Branch → dev → (CI Tests) → main → Production
```

1. **Development**: Work happens on `dev` branch or feature branches that merge into `dev`
2. **Testing**: CI automatically runs on `dev` branch
3. **Promotion**: When ready, promote `dev` to `main` using the automated workflow
4. **Production**: `main` branch auto-deploys to production via Vercel

## Automated Promotion Workflow

We have a GitHub Actions workflow that automates the promotion from `dev` to `main`.

### Manual Promotion (Recommended)

1. Go to **Actions** tab in GitHub
2. Select **"Promote Dev to Production"** workflow
3. Click **"Run workflow"**
4. Choose options:
   - **Skip CI checks**: Only use if CI already passed (e.g., you just saw it pass)
   - **Create release**: Optionally create a GitHub release after promotion
5. Click **"Run workflow"**

The workflow will:

- ✅ Check if `dev` has new changes compared to `main`
- ✅ Run CI checks (lint, typecheck, tests, build) unless skipped
- ✅ Merge `dev` into `main` with a descriptive commit message
- ✅ Push to `main` (triggers production deployment)
- ✅ Optionally create a GitHub release

### What Happens During Promotion

1. **Status Check**: Verifies `dev` has changes not in `main`
2. **CI Validation**: Runs full test suite (unless skipped)
3. **Safe Merge**: Creates a merge commit with traceability
4. **Production Deploy**: Vercel automatically deploys `main` branch

### Safety Features

- **No force push**: Uses safe merge commits
- **CI gates**: Tests must pass before promotion (unless explicitly skipped)
- **Conflict detection**: Fails gracefully if merge conflicts exist
- **Audit trail**: Every promotion is logged with commit SHA and actor

## CI/CD Pipeline

### On `dev` Branch

When code is pushed to `dev`, the CI workflow runs:

- Lint checks
- TypeScript type checking
- Unit & integration tests
- Functional tests
- Security scans
- Build verification

### On `main` Branch

When code is promoted to `main`:

- Same CI checks as `dev`
- Automatic deployment to Vercel production
- E2E tests (if configured)

## Vercel Configuration

Configure Vercel to:

- **Production**: Deploy from `main` branch
- **Preview**: Deploy from `dev` branch (optional, for staging)

This ensures:

- `dev` changes are visible in preview/staging
- `main` changes go directly to production
- No untested code reaches production

## Best Practices

1. **Always test on `dev` first**: Never push untested code to `main`
2. **Use feature branches**: Create branches from `dev` for new features
3. **Review before promoting**: Check CI status before promoting to `main`
4. **Monitor production**: Watch deployment logs after promotion
5. **Rollback plan**: Keep `main` stable - use feature flags for risky changes

## Troubleshooting

### Promotion Fails with "No changes"

- `dev` and `main` are already in sync
- This is normal if you just promoted

### Promotion Fails with "Merge conflicts"

- Someone pushed directly to `main` (not recommended)
- Resolve conflicts manually:
  ```bash
  git checkout main
  git pull origin main
  git merge dev
  # Resolve conflicts
  git push origin main
  ```

### CI Checks Fail

- Fix issues on `dev` branch
- Re-run promotion after fixes

### Need to Skip CI

- Only use if you just saw CI pass
- Useful for urgent hotfixes
- Still creates proper merge commit

## Emergency Hotfixes

For critical production issues:

1. Create hotfix branch from `main`:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-issue
   ```

2. Make fix and test locally

3. Merge to both `dev` and `main`:

   ```bash
   # Merge to dev
   git checkout dev
   git merge hotfix/critical-issue
   git push origin dev

   # Merge to main
   git checkout main
   git merge hotfix/critical-issue
   git push origin main
   ```

4. Delete hotfix branch after deployment

## Workflow File

The automation is defined in:

- `.github/workflows/promote-to-production.yml`

To modify the workflow, edit that file and commit to `dev`.
