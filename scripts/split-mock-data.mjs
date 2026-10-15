/**
 * One-time script: split src/lib/mock/data.ts into smaller files (each ≤400 lines).
 * Run: node scripts/split-mock-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mockDir = path.join(root, "src", "lib", "mock");
const dataPath = path.join(mockDir, "data.ts");
const content = fs.readFileSync(dataPath, "utf8");
const lines = content.split("\n");

function writeFile(relPath, body) {
  const full = path.join(mockDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf8");
  const count = body.split("\n").length;
  console.log("Wrote", relPath, count, "lines");
  return count;
}

// Line numbers 0-based. Original: 1-10 imports, 12-66 mockUsers, 68-102 mockOrgs, 104-611 mockCandidates, etc.

// 1) users.ts
writeFile(
  "users.ts",
  `import type { User } from "@/types";

${lines.slice(11, 66).join("\n")}
`,
);

// 2) organisations.ts
writeFile(
  "organisations.ts",
  `import type { Organisation } from "@/types";

${lines.slice(67, 102).join("\n")}
`,
);

// 3) candidates: split after cand-10 (line 379 "  },")
const candPart1Lines = lines.slice(104, 380); // 104-379 inclusive → array content
const candPart2Lines = lines.slice(380, 611); // 380-610
writeFile(
  "candidates-part1.ts",
  `import type { Candidate } from "@/types";

export const mockCandidatesPart1: Candidate[] = [
${candPart1Lines.join("\n")}
];
`,
);
writeFile(
  "candidates-part2.ts",
  `import type { Candidate } from "@/types";

export const mockCandidatesPart2: Candidate[] = [
${candPart2Lines.join("\n")}
];
`,
);
writeFile(
  "candidates.ts",
  `import type { Candidate } from "@/types";
import { mockCandidatesPart1 } from "./candidates-part1";
import { mockCandidatesPart2 } from "./candidates-part2";

export const mockCandidates: Candidate[] = [
  ...mockCandidatesPart1,
  ...mockCandidatesPart2,
];
`,
);

// 4) companies.ts
writeFile(
  "companies.ts",
  `import type { Company } from "@/types";

${lines.slice(612, 726).join("\n")}
`,
);

// 5) job-postings.ts
writeFile(
  "job-postings.ts",
  `import type { JobPosting } from "@/types";

${lines.slice(727, 1005).join("\n")}
`,
);

// 6) fit-scores: split after fs-11 (≈1352), after fs-22 (≈1682)
const fs1 = lines.slice(1007, 1353); // 1007-1352
const fs2 = lines.slice(1353, 1683); // 1353-1682
const fs3 = lines.slice(1683, 2003); // 1683-2002
writeFile(
  "fit-scores-part1.ts",
  `import type { FitScore } from "@/types";

export const mockFitScoresPart1: FitScore[] = [
${fs1.join("\n")}
];
`,
);
writeFile(
  "fit-scores-part2.ts",
  `import type { FitScore } from "@/types";

export const mockFitScoresPart2: FitScore[] = [
${fs2.join("\n")}
];
`,
);
writeFile(
  "fit-scores-part3.ts",
  `import type { FitScore } from "@/types";

export const mockFitScoresPart3: FitScore[] = [
${fs3.join("\n")}
];
`,
);
writeFile(
  "fit-scores.ts",
  `import type { FitScore } from "@/types";
import { mockFitScoresPart1 } from "./fit-scores-part1";
import { mockFitScoresPart2 } from "./fit-scores-part2";
import { mockFitScoresPart3 } from "./fit-scores-part3";

export const mockFitScores: FitScore[] = [
  ...mockFitScoresPart1,
  ...mockFitScoresPart2,
  ...mockFitScoresPart3,
];
`,
);

// 7) agent-runs.ts
writeFile(
  "agent-runs.ts",
  `import type { AgentRun } from "@/types";

${lines.slice(2003, 2185).join("\n")}
`,
);

// 8) activity-feed.ts
writeFile(
  "activity-feed.ts",
  `import type { ActivityEvent } from "@/types";

${lines.slice(2186, 2347).join("\n")}
`,
);

// 9) data.ts — re-exports + helpers
writeFile(
  "data.ts",
  `import type { Candidate, Company, JobPosting, FitScore } from "@/types";

export { mockUsers } from "./users";
export { mockOrganisations } from "./organisations";
export { mockCandidates } from "./candidates";
export { mockCompanies } from "./companies";
export { mockJobPostings } from "./job-postings";
export { mockFitScores } from "./fit-scores";
export { mockAgentRuns } from "./agent-runs";
export { mockActivityFeed } from "./activity-feed";

import { mockCandidates } from "./candidates";
import { mockCompanies } from "./companies";
import { mockJobPostings } from "./job-postings";
import { mockFitScores } from "./fit-scores";

export function getCandidateById(id: string): Candidate | undefined {
  return mockCandidates.find((c) => c.id === id);
}

export function getCompanyById(id: string): Company | undefined {
  return mockCompanies.find((c) => c.id === id);
}

export function getJobPostingById(id: string): JobPosting | undefined {
  return mockJobPostings.find((j) => j.id === id);
}

export function getFitScoresForJob(jobId: string): FitScore[] {
  return mockFitScores.filter((fs) => fs.jobPostingId === jobId);
}

export function getFitScoresForCandidate(candidateId: string): FitScore[] {
  return mockFitScores.filter((fs) => fs.candidateId === candidateId);
}

export function getJobPostingsForCompany(companyId: string): JobPosting[] {
  return mockJobPostings.filter((j) => j.companyId === companyId);
}
`,
);

console.log("Done. Run typecheck to verify.");
