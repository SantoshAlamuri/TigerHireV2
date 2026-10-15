# Managing Claude Code Worktrees

Claude Code creates isolated worktrees in `.claude/worktrees/` for each development session. This document explains how to manage these worktrees.

## What are Worktrees?

Git worktrees allow multiple working directories for the same repository. Claude Code uses them to:

- Keep changes isolated per session
- Avoid conflicts between different AI agents
- Allow parallel development without branch switching

## Quick Reference

```bash
# List all worktrees
node scripts/manage-claude-worktrees.mjs

# Review changes in each worktree
node scripts/manage-claude-worktrees.mjs --review

# Merge a worktree into dev
node scripts/manage-claude-worktrees.mjs --merge <name>

# Remove a worktree
node scripts/manage-claude-worktrees.mjs --remove <name>

# Clean up empty worktrees
node scripts/manage-claude-worktrees.mjs --cleanup
```

## Workflow

### 1. List Active Worktrees

```bash
node scripts/manage-claude-worktrees.mjs
```

This shows:

- Worktree names
- Current branch
- Status (has changes / clean)
- Path location

### 2. Review Changes

```bash
node scripts/manage-claude-worktrees.mjs --review
```

This shows:

- What branch each worktree is on
- Summary of changes vs `dev`
- File statistics

### 3. Decide: Merge or Remove

#### If changes look good → Merge

```bash
node scripts/manage-claude-worktrees.mjs --merge <worktree-name>
```

This will:

- Checkout `dev` branch
- Pull latest from origin
- Merge the worktree's changes
- Create a merge commit with traceability

**After merging:**

```bash
git push origin dev
```

#### If changes are duplicates or not needed → Remove

```bash
node scripts/manage-claude-worktrees.mjs --remove <worktree-name>
```

This safely removes the worktree and cleans up Git references.

### 4. Clean Up Regularly

```bash
node scripts/manage-claude-worktrees.mjs --cleanup
```

Removes worktrees that:

- Have no changes vs `dev`
- Are in a clean state (no uncommitted changes)

## Manual Workflow (Alternative)

If you prefer manual commands:

```bash
# See all active worktrees
git worktree list

# Review what each agent did
git -C .claude/worktrees/clever-napier diff dev
git -C .claude/worktrees/zealous-moser diff dev

# If the changes look good, merge them
git checkout dev
git pull origin dev
git merge claude/clever-napier  # or the branch name
git push origin dev

# If they're duplicates, remove the redundant one
git worktree remove .claude/worktrees/clever-napier --force
```

## Common Scenarios

### Scenario 1: Multiple Worktrees with Similar Changes

**Problem:** Two worktrees have overlapping changes.

**Solution:**

1. Review both: `--review`
2. Merge the more complete one: `--merge <name>`
3. Check if the other has unique changes
4. If duplicate, remove: `--remove <name>`
5. If unique, merge the second one too

### Scenario 2: Worktree with Uncommitted Changes

**Problem:** Worktree has changes but they're not committed.

**Solution:**

```bash
cd .claude/worktrees/<name>
git status                    # See what changed
git add -A                    # Stage all changes
git commit -m "feat: description"  # Commit
cd ../../..
node scripts/manage-claude-worktrees.mjs --merge <name>
```

### Scenario 3: Merge Conflicts

**Problem:** Merging worktree causes conflicts.

**Solution:**

1. The script will fail and show the conflict
2. Resolve conflicts manually:
   ```bash
   git status                    # See conflicted files
   # Edit files to resolve conflicts
   git add <resolved-files>
   git commit                    # Complete the merge
   git push origin dev
   ```
3. Remove the worktree after successful merge

### Scenario 4: Detached HEAD State

**Problem:** Worktree is in detached HEAD (no branch).

**Solution:**
The merge script handles this automatically by merging the commit directly. If you need to create a branch first:

```bash
cd .claude/worktrees/<name>
git checkout -b claude/<name>
git push origin claude/<name>
cd ../../..
node scripts/manage-claude-worktrees.mjs --merge <name>
```

## Best Practices

1. **Review regularly**: Check worktrees weekly or after major AI sessions
2. **Merge promptly**: Don't let worktrees accumulate
3. **Test before merging**: Review diffs carefully
4. **Clean up**: Remove merged or duplicate worktrees
5. **One at a time**: Merge worktrees sequentially to avoid conflicts

## Integration with Promotion Workflow

After merging worktrees into `dev`:

1. Test on `dev` branch
2. Use the promotion workflow to move to `main`:
   - GitHub Actions → "Promote Dev to Production"
   - Or manually: `git checkout main && git merge dev && git push origin main`

## Troubleshooting

### "Worktree not found"

- Check the name: `node scripts/manage-claude-worktrees.mjs --list`
- Verify path: `ls -la .claude/worktrees/`

### "Cannot remove worktree"

- Make sure you're not inside the worktree directory
- Try: `git worktree remove .claude/worktrees/<name> --force`
- If that fails: `rm -rf .claude/worktrees/<name>` (last resort)

### "Merge conflicts"

- Resolve manually as shown in Scenario 3
- Consider cherry-picking specific commits instead

### "Permission denied"

- Check file permissions: `ls -la .claude/worktrees/`
- May need to fix ownership or permissions

## Script Location

The management script is at:

- `scripts/manage-claude-worktrees.mjs`

You can also add it to your `package.json` scripts for convenience:

```json
{
  "scripts": {
    "worktrees": "node scripts/manage-claude-worktrees.mjs",
    "worktrees:review": "node scripts/manage-claude-worktrees.mjs --review",
    "worktrees:cleanup": "node scripts/manage-claude-worktrees.mjs --cleanup"
  }
}
```

Then use: `npm run worktrees:review`
