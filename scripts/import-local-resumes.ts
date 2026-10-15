import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  extractTextFromBuffer,
  inferMimeFromName,
} from "../src/lib/services/extract-document-text";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FILES = [
  "/Users/santoshalamuri/Downloads/shashankgarg_14Mar_19.pdf",
  "/Users/santoshalamuri/Downloads/Sridhar Lenka_Resume_7th Mar2026.pdf",
  "/Users/santoshalamuri/Downloads/Vijay Golla.pdf",
  "/Users/santoshalamuri/Downloads/Vinod_S_Resume_UI_UI_AI.pdf",
  "/Users/santoshalamuri/Downloads/JasRaj-CV.pdf",
  "/Users/santoshalamuri/Downloads/Pulkit hasani_20260303_151938_0000.pdf",
  "/Users/santoshalamuri/Downloads/Gurwinder Resume 04 02 26 (1).pdf",
  "/Users/santoshalamuri/Downloads/Pankaj_Kulariya_20_April_2026.pdf",
  "/Users/santoshalamuri/Downloads/Manish Gupta Resume UI-UX Designer Remote.pdf",
  "/Users/santoshalamuri/Downloads/Chaitanya Krishna.pdf",
  "/Users/santoshalamuri/Downloads/Vipul_Sharma_ScrumMaster_Resume (1).docx",
] as const;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function main() {
  const results: Array<Record<string, unknown>> = [];

  for (const filePath of FILES) {
    try {
      const base = path.basename(filePath);
      const stem = base.replace(/\.(pdf|docx|doc|txt)$/i, "");
      const fullName = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      const email = `prelaunch-${slugify(stem)}@example.com`;

      const buffer = await fs.readFile(filePath);
      const mime = inferMimeFromName(base) || "application/pdf";
      const extracted = await extractTextFromBuffer(buffer, mime, base);
      const cvRawText = extracted
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, 100_000);

      const payload = {
        name: fullName,
        full_name: fullName,
        email,
        cv_raw_text: cvRawText,
        skills: [],
        location: "India",
      };

      const { data: existing, error: existingError } = await admin
        .from("candidates")
        .select("id")
        .eq("email", email)
        .limit(1);
      if (existingError) throw existingError;

      let candidateId: string | undefined;
      if (existing?.[0]?.id) {
        candidateId = existing[0].id as string;
        const { error: updateError } = await admin
          .from("candidates")
          .update(payload)
          .eq("id", candidateId);
        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await admin
          .from("candidates")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        candidateId = inserted?.id as string;
      }

      results.push({
        file: base,
        candidate_id: candidateId,
        name: fullName,
        cv_length: cvRawText.length,
        status: "ok",
      });
    } catch (error) {
      results.push({
        file: path.basename(filePath),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
