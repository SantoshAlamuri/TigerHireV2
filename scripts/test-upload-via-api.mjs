#!/usr/bin/env node

/**
 * Test script to upload resume via API
 * This bypasses the browser file dialog limitation
 */

import { readFile } from "fs/promises";
import { basename, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = process.env.RESUME_PATH || join(__dirname, "test-resume.pdf");
const API_URL = process.env.API_URL || "http://localhost:3000/api/candidates/upload-resume";

async function uploadResume() {
  try {
    console.log("📄 Reading resume file...");
    const fileBuffer = await readFile(RESUME_PATH);
    const fileName = basename(RESUME_PATH);

    console.log(`✅ File loaded: ${fileName} (${fileBuffer.length} bytes)`);

    // Create FormData
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    console.log("📤 Uploading to API...");
    console.log(`   URL: ${API_URL}`);

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
      // Note: In a real browser session, cookies would be automatically included
      // This script won't work without authentication cookies
    });

    const contentType = response.headers.get("content-type");
    let result;

    if (contentType && contentType.includes("application/json")) {
      result = await response.json();
    } else {
      result = await response.text();
    }

    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    console.log("📄 Response Body:");
    console.log(JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log("\n✅ Upload successful!");
      if (result.resumeUrl) {
        console.log(`   Resume URL: ${result.resumeUrl}`);
      }
      if (result.viewUrl) {
        console.log(`   View URL: ${result.viewUrl}`);
      }
    } else {
      console.log("\n❌ Upload failed!");
      console.log(`   Error: ${result.error || result.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("\n❌ Error during upload:");
    console.error(error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

uploadResume();
