#!/usr/bin/env node

/**
 * Quick verification script to check if job board credentials setup is correct
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

console.log("🔍 Verifying Job Board Credentials Setup...\n");

let hasErrors = false;

// Check .env.local exists
const envLocalPath = join(rootDir, ".env.local");
if (!existsSync(envLocalPath)) {
  console.error("❌ .env.local file not found");
  hasErrors = true;
} else {
  console.log("✅ .env.local exists");

  const envContent = readFileSync(envLocalPath, "utf-8");

  // Check encryption key
  if (!envContent.includes("JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=")) {
    console.error("❌ JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY not found in .env.local");
    hasErrors = true;
  } else {
    const keyMatch = envContent.match(/JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=([a-f0-9]+)/);
    if (keyMatch && keyMatch[1].length === 64) {
      console.log("✅ Encryption key found and has correct length (64 hex chars)");
    } else {
      console.error(
        "❌ Encryption key is missing or has wrong length (should be 64 hex characters)",
      );
      hasErrors = true;
    }
  }

  // Check fallback setting
  if (envContent.includes("ALLOW_JOB_BOARD_GLOBAL_FALLBACK=false")) {
    console.log("✅ Global fallback is disabled (tenant isolation enforced)");
  } else if (envContent.includes("ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true")) {
    console.log("⚠️  Global fallback is enabled (for migration only)");
  } else {
    console.log("ℹ️  Global fallback setting not found (will default to false)");
  }
}

// Check required files exist
const requiredFiles = [
  "src/lib/security/credentials-encryption.ts",
  "src/lib/distribution/credentials.ts",
  "src/lib/distribution/connectors/adzuna.ts",
  "src/lib/distribution/connectors/indeed.ts",
  "src/lib/distribution/engine.ts",
  "src/app/api/org/job-board-credentials/route.ts",
  "src/app/(dashboard)/company/settings/page.tsx",
  "supabase/migrations/20260319000000_organisation_job_board_credentials.sql",
];

console.log("\n📁 Checking required files...");
for (const file of requiredFiles) {
  const filePath = join(rootDir, file);
  if (existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.error(`❌ ${file} - MISSING`);
    hasErrors = true;
  }
}

// Check package.json for dependencies
const packageJsonPath = join(rootDir, "package.json");
if (existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  console.log("\n📦 Checking dependencies...");

  const requiredDeps = ["next", "react", "zod"];
  for (const dep of requiredDeps) {
    if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
      console.log(`✅ ${dep} installed`);
    } else {
      console.error(`❌ ${dep} - MISSING`);
      hasErrors = true;
    }
  }
}

console.log("\n" + "=".repeat(50));
if (hasErrors) {
  console.error("\n❌ Setup verification failed. Please fix the errors above.");
  process.exit(1);
} else {
  console.log("\n✅ All checks passed! Setup looks good.");
  console.log("\n💡 Next steps:");
  console.log("   1. Make sure database migration is applied");
  console.log("   2. Restart your dev server: npm run dev");
  console.log("   3. Test at /company/settings");
  process.exit(0);
}
