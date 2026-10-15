#!/usr/bin/env node
/**
 * Full end-to-end test: upload PDF → parse → enrich DB → verify.
 *
 * Usage:
 *   node scripts/test-upload-e2e.mjs [path-to-pdf] [candidateEmail]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const pdfPath = process.argv[2] || "scripts/test-resume.pdf";
  const email = process.argv[3] || "priya.sharma@gmail.com";

  if (!existsSync(resolve(pdfPath))) {
    console.error(`PDF not found: ${resolve(pdfPath)}`);
    console.error("Run: node scripts/create-test-pdf.mjs");
    process.exit(1);
  }

  const pdfBuffer = readFileSync(resolve(pdfPath));
  console.log(`PDF: ${resolve(pdfPath)} (${pdfBuffer.length} bytes)`);
  console.log(`Candidate: ${email}`);
  console.log(`Endpoint: ${BASE_URL}/api/debug/test-upload-e2e\n`);
  console.log("=".repeat(60));

  const boundary = "----TestBoundary" + Date.now();
  const parts = [];

  // file field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-resume.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
  );
  parts.push(pdfBuffer);
  parts.push(Buffer.from("\r\n"));

  // candidateEmail field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="candidateEmail"\r\n\r\n${email}\r\n`,
    ),
  );

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  try {
    const startMs = Date.now();
    const response = await fetch(`${BASE_URL}/api/debug/test-upload-e2e`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    const totalMs = Date.now() - startMs;

    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error(text.slice(0, 1000));
      process.exit(1);
    }

    const result = await response.json();

    console.log(`\nTotal time: ${totalMs}ms`);
    console.log(`Overall: ${result.allPassed ? "ALL PASSED" : "SOME FAILED"}`);
    console.log(`Candidate ID: ${result.candidateId}\n`);

    for (const step of result.steps) {
      const icon = step.status === "pass" ? "[PASS]" : step.status === "fail" ? "[FAIL]" : "[SKIP]";
      console.log(`${icon} ${step.step} (${step.durationMs}ms)`);

      if (step.detail) {
        if (typeof step.detail === "string") {
          console.log(`     ${step.detail}`);
        } else {
          const d = step.detail;
          if (d.parsed) {
            console.log(`     Name: ${d.parsed.full_name}`);
            console.log(
              `     Skills (${d.parsed.canonical_skills?.length}): ${d.parsed.canonical_skills?.slice(0, 10).join(", ")}...`,
            );
            console.log(`     Seniority: ${d.parsed.seniority_level}`);
            console.log(`     Experience: ${d.parsed.years_experience} years`);
            console.log(`     Location: ${d.parsed.location_city}`);
            console.log(`     Availability: ${d.parsed.availability}`);
            console.log(
              `     Salary: ${d.parsed.salary_expectation_min}-${d.parsed.salary_expectation_max} LPA`,
            );
            console.log(`     Tokens: ${d.tokens?.input}in / ${d.tokens?.output}out`);
          } else if (d.savedProfile) {
            console.log(`     DB Verification:`);
            console.log(`       Name: ${d.savedProfile.full_name}`);
            console.log(
              `       Skills (${d.savedProfile.skills?.length}): ${d.savedProfile.skills?.slice(0, 10).join(", ")}...`,
            );
            console.log(`       Experience: ${d.savedProfile.experience_years} years`);
            console.log(`       Seniority: ${d.savedProfile.seniority_level}`);
            console.log(`       Role: ${d.savedProfile.current_role}`);
            console.log(`       Company: ${d.savedProfile.current_company}`);
            console.log(`       Location: ${d.savedProfile.location}`);
            console.log(`       Parsed at: ${d.savedProfile.cv_parsed_at}`);
          } else {
            const json = JSON.stringify(d, null, 2);
            for (const line of json.split("\n")) {
              console.log(`     ${line}`);
            }
          }
        }
      }
      if (step.error) {
        console.log(`     ERROR: ${step.error}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    process.exit(result.allPassed ? 0 : 1);
  } catch (e) {
    console.error("Request failed:", e.message);
    process.exit(1);
  }
}

main();
