import type { JobPosting } from "@/types";

export function formatSalary(val: number): string {
  return `₹${(val / 100000).toFixed(0)}L`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function buildShareableJd(job: JobPosting, jobUrl: string): string {
  const lines: string[] = [];
  lines.push(`*${job.titleNormalised}*`);
  lines.push(job.companyName);
  lines.push("");
  lines.push(`📍 ${job.location}`);
  lines.push(job.remoteAllowed ? "🌐 Remote allowed" : "🌐 On-site only");
  if (job.salaryMin > 0 || job.salaryMax > 0) {
    lines.push(`💰 ${formatSalary(job.salaryMin)} – ${formatSalary(job.salaryMax)} / year`);
  }
  if (job.skillsRequired.length > 0) {
    lines.push(`Skills: ${job.skillsRequired.join(", ")}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Job Description");
  lines.push("---");
  lines.push("");
  lines.push((job.jdTextRaw || "").trim());
  lines.push("");
  lines.push("Apply or refer someone:");
  lines.push(jobUrl);
  return lines.join("\n");
}
