#!/usr/bin/env bash
# Delete remote branches whose tips are fully contained in the integration base (default: origin/dev).
# Safe for deploys: only removes GitHub pointers; code must already be on dev (or main).
set -euo pipefail

REMOTE="${REMOTE:-origin}"
# TigerHire integrates on dev first; use origin/main only when auditing prod-only promotion gaps.
BASE="${BASE:-origin/dev}"
PROTECTED=(main dev)
# Branches with open PRs or external blockers — never delete even if git says "merged".
NEVER_DELETE=(
  claude/idibu-integration
)

usage() {
  cat <<USAGE
Usage: git-delete-merged-remote-branches.sh [--list] [--execute] [--yes] [--dry-run]

  --list     Print delete-safe and keep branch lists (default)
  --dry-run  Same as --list
  --execute  Delete delete-safe remote branches on GitHub
  --yes      Skip confirmation prompt

Environment:
  BASE=origin/dev   merge base (default). Use origin/main to audit prod promotion only.

Never deletes: main, dev, and branches in NEVER_DELETE (open PR / blocked work).

Manual checks (recommended before --execute):
  git branch -r --merged origin/dev    # same as DELETE-SAFE (when BASE=origin/dev)
  git branch -r --no-merged origin/dev # KEEP — review each before deleting

Migration rule: if a branch carries migrations not on dev, do not delete until merged to dev.
  ls supabase/migrations on origin/dev is the source of truth for applied schema work.
USAGE
}

is_protected() {
  local b="$1"
  for p in "${PROTECTED[@]}"; do
    [[ "$b" == "$p" ]] && return 0
  done
  for p in "${NEVER_DELETE[@]}"; do
    [[ "$b" == "$p" ]] && return 0
  done
  return 1
}

collect_branches() {
  # Always refresh origin/dev (or BASE) before classifying branches — stale refs make
  # unmerged branches look safe or vice versa; fetch-first keeps deletes conservative.
  echo "Fetching ${REMOTE} (prune stale refs) before comparing against ${BASE}..."
  git fetch "$REMOTE" --prune
  local ref branch ahead
  SAFE=()
  KEEP=()
  PINNED=()
  while IFS= read -r ref; do
    [[ "$ref" == "$REMOTE" ]] && continue
    branch="${ref#${REMOTE}/}"
    [[ "$branch" == "$ref" ]] && continue
    [[ -z "$branch" || "$branch" == "HEAD" ]] && continue
    for p in "${PROTECTED[@]}"; do
      [[ "$branch" == "$p" ]] && continue 2
    done
    for p in "${NEVER_DELETE[@]}"; do
      if [[ "$branch" == "$p" ]]; then
        PINNED+=("$branch")
        continue 2
      fi
    done
    ahead="$(git rev-list --count "${BASE}..${REMOTE}/${branch}" 2>/dev/null || echo 999)"
    if [[ "$ahead" == "0" ]]; then
      SAFE+=("$branch")
    else
      KEEP+=("$branch:$ahead")
    fi
  done < <(git for-each-ref "refs/remotes/${REMOTE}" --format='%(refname:short)' | sort)
}

print_lists() {
  echo "Base: ${BASE} ($(git rev-parse --short "${BASE}"))"
  echo "Delete-safe: ${#SAFE[@]} branches (0 commits ahead of ${BASE})"
  echo "Pinned (never delete): ${#PINNED[@]}"
  echo "Keep (unmerged): ${#KEEP[@]}"
  echo ""
  if ((${#PINNED[@]})); then
    echo "=== PINNED (open PR / blocked — skip even if merged) ==="
    printf '%s\n' "${PINNED[@]}"
    echo ""
  fi
  if ((${#SAFE[@]})); then
    echo "=== DELETE-SAFE ==="
    printf '%s\n' "${SAFE[@]}"
  fi
  if ((${#KEEP[@]})); then
    echo ""
    echo "=== KEEP (not deleted) ==="
    printf '%s\n' "${KEEP[@]}"
  fi
}

execute_delete() {
  local branch failed=0 ok=0 skipped=0
  echo "Deleting ${#SAFE[@]} remote branch(es) on ${REMOTE}..."
  for branch in "${SAFE[@]}"; do
    if is_protected "$branch"; then
      echo "SKIP (protected): ${branch}"
      skipped=$((skipped + 1))
      continue
    fi
    if git push "$REMOTE" --delete "$branch"; then
      ok=$((ok + 1))
    else
      echo "FAILED: ${branch}" >&2
      failed=$((failed + 1))
    fi
  done
  echo "Done: ${ok} deleted, ${skipped} skipped, ${failed} failed."
  git fetch "$REMOTE" --prune
}

MODE="${1:---list}"
AUTO_YES=false
if [[ "${2:-}" == "--yes" || "${1:-}" == "--yes" ]]; then
  AUTO_YES=true
fi
if [[ "$MODE" == "--yes" ]]; then
  MODE="--execute"
fi

collect_branches

case "$MODE" in
  --list | --dry-run)
    print_lists
    ;;
  --execute)
    if ((${#SAFE[@]} == 0)); then
      echo "No delete-safe branches found."
      exit 0
    fi
    print_lists
    echo ""
    if [[ "$AUTO_YES" == true ]]; then
      execute_delete
    else
      read -r -p "Delete ${#SAFE[@]} branch(es) on ${REMOTE}? [y/N] " confirm
      if [[ "$confirm" =~ ^[yY]$ ]]; then
        execute_delete
      else
        echo "Aborted."
        exit 1
      fi
    fi
    ;;
  -h | --help)
    usage
    ;;
  *)
    echo "Unknown option: $MODE" >&2
    usage
    exit 1
    ;;
esac
