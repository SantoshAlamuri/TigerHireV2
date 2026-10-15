# Git Workflow for TigerHire

Use this at the start of each session (Cursor, Claude Code, or any agent). **Feature branch → `dev` → `main`.** Never commit directly to `dev` or `main`.

## Current state

Both `dev` and `main` are at **`310ed5a`** (`fix: remove legacy scoring code, fix WhatsApp gates, align seed script`). Branch new work from `dev` after `git pull origin dev`.

---

## Starting a new task

```bash
# 1. Always start from dev, make sure it's current
git checkout dev
git pull origin dev

# 2. Create a feature branch from dev
git checkout -b fix/short-description-of-work

# 3. Do your work, commit as you go
git add .
git commit -m "fix: description of what changed"

# 4. Before push: typecheck (required)
npm run typecheck

# 5. Push the branch
git push -u origin fix/short-description-of-work
```

---

## When the work is done and verified

```bash
# 6. Before merging to dev: run tests (required)
npm test

# 7. Merge feature branch into dev
git checkout dev
git pull origin dev
git merge fix/short-description-of-work
git push origin dev

# 8. Verify on Vercel preview (dev deployment)
# Check the preview URL, run smoke tests, confirm it works

# 9. When dev is good, promote to main (production)
git checkout main
git pull origin main
git merge dev
git push origin main

# 10. Clean up the feature branch
git push origin --delete fix/short-description-of-work
git branch -d fix/short-description-of-work
```

---

## Rules

| Rule                       | Detail                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Branches**               | Never commit directly to `main` or `dev`. Always use a feature branch.           |
| **Base branch**            | Branch from **`dev`**, not from `main`.                                          |
| **Flow**                   | `feature-branch` → `dev` → `main`                                                |
| **Production**             | `main` push → production deploy on Vercel ([tigerhire.io](https://tigerhire.io)) |
| **Integration**            | `dev` push → preview / integration deploy on Vercel                              |
| **Before push**            | `npm run typecheck` — no type errors                                             |
| **Before merge to `dev`**  | `npm test` — no regressions you introduced                                       |
| **Before merge to `main`** | Smoke-test on **dev** preview; only promote when `dev` is known good             |

See also `CLAUDE.md` and `.cursorrules` for co-development notes (parallel editors, worktrees, migrations).

---

## Branch naming

| Type    | Pattern                | Example                        |
| ------- | ---------------------- | ------------------------------ |
| Bug fix | `fix/what-it-fixes`    | `fix/whatsapp-fitscore-gate`   |
| Feature | `feat/what-it-adds`    | `feat/org-calendar-week-view`  |
| Cleanup | `chore/what-it-cleans` | `chore/scoring-legacy-cleanup` |

Claude Code may use `claude/descriptive-name` — same rules: branch off `dev`, PR/merge into `dev` first.

---

## Quick checklist

- [ ] `git checkout dev && git pull origin dev`
- [ ] Feature branch from `dev`
- [ ] `npm run typecheck` before push
- [ ] `npm test` before merge to `dev`
- [ ] Preview soak on `dev` before merge to `main`
- [ ] Delete feature branch after merge
