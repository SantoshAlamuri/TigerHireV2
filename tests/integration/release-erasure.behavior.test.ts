// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
vi.mock("server-only", () => ({}));
import { CandidateService } from "@/lib/services/CandidateService";

// Explicit opt-in: this test writes and erases only its own synthetic preview fixture.
describe.skipIf(process.env.RUN_RELEASE_DB_TESTS !== "1")(
  "release erasure on real preview schema",
  () => {
    it("redacts the stored profile and records successful erasure", async () => {
      execFileSync(process.execPath, ["scripts/assert-ci-preview.mjs"], { stdio: "inherit" });
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const id = randomUUID();
      try {
        const { error: insertError } = await db.from("candidates").insert({
          id,
          name: "Release erasure fixture",
          full_name: "Release erasure fixture",
          email: `${id}@example.invalid`,
          cv_raw_text: "Synthetic fixture only",
          github_url: "https://example.invalid/profile",
        });
        expect(insertError).toBeNull();
        await CandidateService.eraseData(db, id);
        const { data, error } = await db
          .from("candidates")
          .select("name,full_name,email,phone,cv_raw_text,profile_embedding,github_url,erased_at")
          .eq("id", id)
          .single();
        expect(error).toBeNull();
        expect(data).toMatchObject({
          name: "[ERASED]",
          full_name: "[ERASED]",
          email: null,
          phone: null,
          cv_raw_text: null,
          profile_embedding: null,
          github_url: null,
        });
        expect(data?.erased_at).toBeTruthy();
        const { data: audits, error: auditError } = await db
          .from("retention_deletions")
          .select("data_deleted")
          .eq("candidate_id", id);
        expect(auditError).toBeNull();
        expect(audits).toHaveLength(1);
        expect(audits?.[0].data_deleted).toMatchObject({
          cv: true,
          name: true,
          profile_cache: true,
          extraction_log: true,
        });
        // Repeat without reseeding: recovery after a lost completion response must work.
        await expect(CandidateService.eraseData(db, id)).resolves.toBeUndefined();
      } finally {
        const auditCleanup = await db.from("retention_deletions").delete().eq("candidate_id", id);
        const candidateCleanup = await db.from("candidates").delete().eq("id", id);
        expect(auditCleanup.error).toBeNull();
        expect(candidateCleanup.error).toBeNull();
      }
    });
  },
);
