#!/usr/bin/env node
/**
 * Creates a valid test PDF that pdf-parse can extract text from.
 * Uses pdf-lib which is a pure JS PDF library (no native deps).
 */
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);

  let y = 740;
  const lineHeight = 16;
  const sectionGap = 24;

  function drawText(text, opts = {}) {
    page.drawText(text, {
      x: opts.x ?? 50,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? boldFont : font,
    });
    y -= opts.size ? opts.size + 4 : lineHeight;
  }

  drawText("Rahul Sharma", { size: 20, bold: true });
  drawText("Senior Software Engineer", { size: 14 });
  y -= 4;
  drawText("rahul.sharma@email.com | +91 9876543210 | Bangalore, India", { size: 10 });
  y -= sectionGap;

  drawText("PROFESSIONAL SUMMARY", { size: 12, bold: true });
  drawText("Experienced software engineer with 7+ years of experience in building");
  drawText("scalable web applications using React, Node.js, and cloud technologies.");
  drawText("Currently leading a team of 5 engineers at TechCorp building microservices.");
  y -= sectionGap;

  drawText("SKILLS", { size: 12, bold: true });
  drawText("Languages: JavaScript, TypeScript, Python, Java, SQL");
  drawText("Frontend: React, Next.js, Redux, Tailwind CSS, HTML5, CSS3");
  drawText("Backend: Node.js, Express, NestJS, FastAPI, GraphQL");
  drawText("Database: PostgreSQL, MongoDB, Redis, DynamoDB");
  drawText("Cloud: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, Terraform");
  drawText("Tools: Git, GitHub Actions, Jenkins, Jira, Figma");
  y -= sectionGap;

  drawText("EXPERIENCE", { size: 12, bold: true });
  drawText("Senior Software Engineer - TechCorp, Bangalore (2021 - Present)", { bold: true });
  drawText("- Led team of 5 engineers building microservices architecture");
  drawText("- Designed REST APIs handling 10M+ requests/day with 99.9% uptime");
  drawText("- Reduced deployment time by 60% by implementing CI/CD with GitHub Actions");
  drawText("- Mentored 3 junior engineers and conducted 50+ code reviews");
  y -= 8;
  drawText("Software Engineer - StartupXYZ, Bangalore (2018 - 2021)", { bold: true });
  drawText("- Built React frontend serving 100K+ monthly active users");
  drawText("- Implemented real-time features using WebSockets and Redis pub/sub");
  drawText("- Migrated legacy jQuery codebase to React, improving performance by 40%");
  y -= 8;
  drawText("Junior Developer - WebSolutions, Pune (2017 - 2018)", { bold: true });
  drawText("- Developed responsive web applications using HTML, CSS, JavaScript");
  drawText("- Built REST APIs with Node.js and Express");
  y -= sectionGap;

  drawText("EDUCATION", { size: 12, bold: true });
  drawText("B.Tech Computer Science - IIT Bombay (2013 - 2017)", { bold: true });
  drawText("CGPA: 8.5/10");
  y -= sectionGap;

  drawText("AVAILABILITY", { size: 12, bold: true });
  drawText("Available to join within 1 month notice period");
  drawText("Expected salary: 35-45 LPA");

  const pdfBytes = await doc.save();
  const outPath = join(process.cwd(), "scripts", "test-resume.pdf");
  writeFileSync(outPath, pdfBytes);
  console.log(`Test PDF created: ${outPath} (${pdfBytes.length} bytes)`);
}

main().catch(console.error);
