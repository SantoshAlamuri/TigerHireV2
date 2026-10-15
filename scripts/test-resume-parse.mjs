#!/usr/bin/env node
/**
 * Test script: tests each step of the resume parsing pipeline.
 *
 * Usage:
 *   node scripts/test-resume-parse.mjs [path-to-pdf]
 *
 * If no PDF is provided, creates a minimal test PDF.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Minimal valid PDF with text content (a simple resume-like PDF)
function createTestPdf() {
  const text = [
    "John Doe",
    "Software Engineer",
    "john.doe@email.com | +91 9876543210",
    "",
    "SKILLS: JavaScript, TypeScript, React, Node.js, Python, PostgreSQL, AWS",
    "",
    "EXPERIENCE:",
    "Senior Software Engineer at TechCorp (2020-Present)",
    "- Led a team of 5 engineers building microservices",
    "- Designed and implemented REST APIs serving 10M+ requests/day",
    "",
    "Software Engineer at StartupXYZ (2017-2020)",
    "- Built React frontends and Node.js backends",
    "- Implemented CI/CD pipelines with GitHub Actions",
    "",
    "EDUCATION:",
    "B.Tech Computer Science, IIT Bombay (2017)",
    "",
    "LOCATION: Bangalore, India",
    "AVAILABILITY: Immediate",
  ].join("\n");

  // Build a minimal PDF manually
  const objects = [];
  let xref = [];
  let offset = 0;

  function addRaw(str) {
    const bytes = Buffer.from(str, "binary");
    offset += bytes.length;
    objects.push(bytes);
    return bytes;
  }

  addRaw("%PDF-1.4\n");

  // Object 1: Catalog
  xref.push(offset);
  addRaw("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Object 2: Pages
  xref.push(offset);
  addRaw("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // Object 4: Font
  xref.push(offset);
  addRaw("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  // Object 5: Content stream
  const lines = text.split("\n");
  let streamContent = "BT\n/F1 10 Tf\n";
  let y = 750;
  for (const line of lines) {
    const escapedLine = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    streamContent += `1 0 0 1 50 ${y} Tm\n(${escapedLine}) Tj\n`;
    y -= 14;
  }
  streamContent += "ET\n";

  xref.push(offset);
  addRaw(
    `5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`,
  );

  // Object 3: Page
  xref.push(offset);
  addRaw(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>\nendobj\n",
  );

  // Cross-reference table
  const xrefOffset = offset;
  addRaw("xref\n");
  addRaw(`0 ${xref.length + 1}\n`);
  addRaw("0000000000 65535 f \n");
  for (const off of xref) {
    addRaw(String(off).padStart(10, "0") + " 00000 n \n");
  }

  addRaw("trailer\n");
  addRaw(`<< /Size ${xref.length + 1} /Root 1 0 R >>\n`);
  addRaw("startxref\n");
  addRaw(`${xrefOffset}\n`);
  addRaw("%%EOF\n");

  return Buffer.concat(objects);
}

async function main() {
  const pdfPath = process.argv[2];
  let pdfBuffer;

  if (pdfPath && existsSync(resolve(pdfPath))) {
    console.log(`Using PDF: ${resolve(pdfPath)}`);
    pdfBuffer = readFileSync(resolve(pdfPath));
  } else {
    console.log("No PDF provided, creating a minimal test PDF...");
    pdfBuffer = createTestPdf();
    const outPath = join(process.cwd(), "scripts", "test-resume.pdf");
    writeFileSync(outPath, pdfBuffer);
    console.log(`Test PDF written to: ${outPath} (${pdfBuffer.length} bytes)`);
  }

  console.log(`\nTesting against: ${BASE_URL}/api/debug/test-resume-parse\n`);
  console.log("=".repeat(60));

  // Build multipart form data manually
  const boundary = "----TestBoundary" + Date.now();
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="test-resume.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([preamble, pdfBuffer, epilogue]);

  try {
    const response = await fetch(`${BASE_URL}/api/debug/test-resume-parse`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      process.exit(1);
    }

    const result = await response.json();

    console.log(`\nOverall: ${result.allPassed ? "ALL PASSED" : "SOME FAILED"}\n`);

    for (const step of result.steps) {
      const icon = step.status === "pass" ? "[PASS]" : step.status === "fail" ? "[FAIL]" : "[SKIP]";
      console.log(`${icon} ${step.step} (${step.durationMs}ms)`);
      if (step.detail) {
        if (typeof step.detail === "string") {
          console.log(`     ${step.detail}`);
        } else {
          const detail = { ...step.detail };
          // Truncate long fields for readability
          if (detail.preview && detail.preview.length > 200) {
            detail.preview = detail.preview.slice(0, 200) + "...";
          }
          if (detail.parsed) {
            console.log(`     Parsed name: ${detail.parsed.full_name}`);
            console.log(`     Skills: ${detail.parsed.canonical_skills?.join(", ")}`);
            console.log(`     Seniority: ${detail.parsed.seniority_level}`);
            console.log(`     Experience: ${detail.parsed.years_experience} years`);
            console.log(`     Location: ${detail.parsed.location_city}`);
            console.log(`     Tokens: ${detail.tokens?.input}in / ${detail.tokens?.output}out`);
          } else {
            console.log(`     ${JSON.stringify(detail, null, 2).split("\n").join("\n     ")}`);
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
