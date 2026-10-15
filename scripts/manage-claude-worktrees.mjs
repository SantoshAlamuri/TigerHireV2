#!/usr/bin/env node
/**
 * Manage Claude Code worktrees
 *
 * This script helps review, merge, and clean up Claude Code worktrees.
 * Claude Code creates worktrees in .claude/worktrees/ for isolated development.
 *
 * Usage:
 *   node scripts/manage-claude-worktrees.mjs                    # List all worktrees
 *   node scripts/manage-claude-worktrees.mjs --review           # Review changes in each
 *   node scripts/manage-claude-worktrees.mjs --merge <name>      # Merge a worktree into dev
 *   node scripts/manage-claude-worktrees.mjs --remove <name>     # Remove a worktree
 *   node scripts/manage-claude-worktrees.mjs --cleanup           # Remove empty/duplicate worktrees
 */

import { execSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WORKTREES_DIR = join(REPO_ROOT, ".claude", "worktrees");

function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: "utf-8",
      cwd: REPO_ROOT,
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    });
  } catch (error) {
    if (!options.silent) {
      console.error(`Error: ${error.message}`);
    }
    throw error;
  }
}

function getWorktrees() {
  if (!existsSync(WORKTREES_DIR)) {
    return [];
  }

  const entries = readdirSync(WORKTREES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "." && name !== "..");
}

function getWorktreePath(name) {
  return join(WORKTREES_DIR, name);
}

function getWorktreeBranch(name) {
  const worktreePath = getWorktreePath(name);
  try {
    const branch = exec(`git -C "${worktreePath}" branch --show-current`, {
      silent: true,
    }).trim();
    return branch || "detached";
  } catch {
    return "unknown";
  }
}

function getWorktreeStatus(name) {
  const worktreePath = getWorktreePath(name);
  try {
    const status = exec(`git -C "${worktreePath}" status --short`, {
      silent: true,
    }).trim();
    return status ? "has changes" : "clean";
  } catch {
    return "error";
  }
}

function getDiffStats(name, baseBranch = "dev") {
  const worktreePath = getWorktreePath(name);
  try {
    const stats = exec(`git -C "${worktreePath}" diff ${baseBranch}..HEAD --stat`, {
      silent: true,
    }).trim();
    return stats || "no changes";
  } catch {
    return "error getting diff";
  }
}

function listWorktrees() {
  const worktrees = getWorktrees();

  if (worktrees.length === 0) {
    console.log("✅ No Claude Code worktrees found.");
    return;
  }

  console.log(`\n📁 Found ${worktrees.length} Claude Code worktree(s):\n`);

  for (const name of worktrees) {
    const branch = getWorktreeBranch(name);
    const status = getWorktreeStatus(name);
    const path = getWorktreePath(name);

    console.log(`  📂 ${name}`);
    console.log(`     Branch: ${branch}`);
    console.log(`     Status: ${status}`);
    console.log(`     Path: ${path}\n`);
  }
}

function reviewWorktrees() {
  const worktrees = getWorktrees();

  if (worktrees.length === 0) {
    console.log("✅ No Claude Code worktrees found.");
    return;
  }

  console.log(`\n🔍 Reviewing ${worktrees.length} worktree(s):\n`);
  console.log("=".repeat(80));

  for (const name of worktrees) {
    const branch = getWorktreeBranch(name);
    const status = getWorktreeStatus(name);
    const stats = getDiffStats(name);

    console.log(`\n📂 ${name}`);
    console.log(`   Branch: ${branch}`);
    console.log(`   Status: ${status}`);
    console.log(`\n   Changes vs dev:`);

    if (stats === "no changes") {
      console.log("   ✅ No changes (already merged or empty)");
    } else if (stats === "error getting diff") {
      console.log("   ⚠️  Could not get diff");
    } else {
      // Show first few lines of stats
      const lines = stats.split("\n").slice(0, 10);
      lines.forEach((line) => console.log(`   ${line}`));
      if (stats.split("\n").length > 10) {
        console.log(`   ... (${stats.split("\n").length - 10} more files)`);
      }
    }

    console.log("\n" + "=".repeat(80));
  }

  console.log("\n💡 Next steps:");
  console.log("   • To merge a worktree: node scripts/manage-claude-worktrees.mjs --merge <name>");
  console.log(
    "   • To remove a worktree: node scripts/manage-claude-worktrees.mjs --remove <name>",
  );
  console.log("   • To see full diff: git -C .claude/worktrees/<name> diff dev\n");
}

function mergeWorktree(name) {
  const worktreePath = getWorktreePath(name);

  if (!existsSync(worktreePath)) {
    console.error(`❌ Worktree '${name}' not found.`);
    process.exit(1);
  }

  console.log(`\n🔄 Merging worktree '${name}' into dev...\n`);

  try {
    // Check current branch
    exec("git checkout dev");
    exec("git pull origin dev");

    // Get the branch name from worktree
    const branch = getWorktreeBranch(name);
    if (branch === "unknown" || branch === "detached") {
      console.log("⚠️  Worktree is in detached HEAD state. Checking for uncommitted changes...");
      const status = getWorktreeStatus(name);
      if (status === "has changes") {
        console.log("❌ Worktree has uncommitted changes. Please commit them first:");
        console.log(`   cd ${worktreePath}`);
        console.log(`   git add -A`);
        console.log(`   git commit -m "feat: changes from ${name}"`);
        process.exit(1);
      }
    }

    // Merge the worktree branch
    if (branch !== "unknown" && branch !== "detached") {
      console.log(`Merging branch '${branch}'...`);
      exec(`git merge ${branch} --no-ff -m "chore: merge Claude Code worktree ${name}"`);
    } else {
      // If detached, we need to merge by commit
      const commit = exec(`git -C "${worktreePath}" rev-parse HEAD`, {
        silent: true,
      }).trim();
      console.log(`Merging commit ${commit}...`);
      exec(`git merge ${commit} --no-ff -m "chore: merge Claude Code worktree ${name}"`);
    }

    console.log("\n✅ Successfully merged into dev!");
    console.log("💡 Next step: git push origin dev\n");
  } catch (error) {
    console.error("\n❌ Merge failed. You may need to resolve conflicts manually.");
    console.error(`   Worktree path: ${worktreePath}`);
    process.exit(1);
  }
}

function removeWorktree(name) {
  const worktreePath = getWorktreePath(name);

  if (!existsSync(worktreePath)) {
    console.error(`❌ Worktree '${name}' not found.`);
    process.exit(1);
  }

  console.log(`\n🗑️  Removing worktree '${name}'...\n`);

  try {
    exec(`git worktree remove "${worktreePath}" --force`);
    console.log(`✅ Successfully removed worktree '${name}'.\n`);
  } catch (error) {
    console.error(`❌ Failed to remove worktree: ${error.message}`);
    console.error(`   You may need to remove it manually: rm -rf ${worktreePath}`);
    process.exit(1);
  }
}

function cleanupWorktrees() {
  const worktrees = getWorktrees();

  if (worktrees.length === 0) {
    console.log("✅ No worktrees to clean up.");
    return;
  }

  console.log(`\n🧹 Cleaning up worktrees...\n`);

  for (const name of worktrees) {
    const stats = getDiffStats(name);
    const status = getWorktreeStatus(name);

    if (stats === "no changes" && status === "clean") {
      console.log(`📂 ${name}: No changes, removing...`);
      try {
        removeWorktree(name);
      } catch {
        // Already logged
      }
    } else {
      console.log(`📂 ${name}: Has changes, keeping (use --review to see details)`);
    }
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--list" || args[0] === "-l") {
  listWorktrees();
} else if (args[0] === "--review" || args[0] === "-r") {
  reviewWorktrees();
} else if (args[0] === "--merge" || args[0] === "-m") {
  if (!args[1]) {
    console.error("❌ Please specify a worktree name to merge.");
    console.error("   Usage: node scripts/manage-claude-worktrees.mjs --merge <name>");
    process.exit(1);
  }
  mergeWorktree(args[1]);
} else if (args[0] === "--remove" || args[0] === "-d") {
  if (!args[1]) {
    console.error("❌ Please specify a worktree name to remove.");
    console.error("   Usage: node scripts/manage-claude-worktrees.mjs --remove <name>");
    process.exit(1);
  }
  removeWorktree(args[1]);
} else if (args[0] === "--cleanup" || args[0] === "-c") {
  cleanupWorktrees();
} else {
  console.log("Claude Code Worktree Manager\n");
  console.log("Usage:");
  console.log("  node scripts/manage-claude-worktrees.mjs [--list]           List all worktrees");
  console.log(
    "  node scripts/manage-claude-worktrees.mjs --review            Review changes in each worktree",
  );
  console.log(
    "  node scripts/manage-claude-worktrees.mjs --merge <name>      Merge a worktree into dev",
  );
  console.log("  node scripts/manage-claude-worktrees.mjs --remove <name>      Remove a worktree");
  console.log(
    "  node scripts/manage-claude-worktrees.mjs --cleanup            Remove empty/duplicate worktrees",
  );
  process.exit(1);
}
