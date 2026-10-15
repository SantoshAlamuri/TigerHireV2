/**
 * Fictional sample resumes for the homepage live demo. These are the ONLY
 * candidates the public demo ever scores — no uploads, no PII. Profiles are
 * deliberately varied so any pasted JD produces a realistic score spread.
 */

export interface DemoCandidate {
  id: string;
  name: string;
  initials: string;
  headline: string;
  resume: string;
}

export const DEMO_CANDIDATES: DemoCandidate[] = [
  {
    id: "sample-1",
    name: "Sample Candidate 1",
    initials: "C1",
    headline: "Technical Scrum Master · 9 yrs",
    resume: `Sample Candidate 1 — Technical Scrum Master (9 yrs, Bangalore)
Led agile delivery for 8 cross-functional Scrum teams (44 engineers) at a fintech scale-up.
Cut release cycle time 40% by introducing flow metrics and WIP limits.
Ran delivery governance and quarterly risk reviews reporting to the VP Engineering.
Hands-on with Jira advanced roadmaps, CI/CD pipelines (Jenkins, 1 yr direct exposure).
Certifications: CSM, PMI-ACP. Stakeholder management across product, finance and compliance.`,
  },
  {
    id: "sample-2",
    name: "Sample Candidate 2",
    initials: "C2",
    headline: "Backend Engineer · 6 yrs",
    resume: `Sample Candidate 2 — Senior Backend Engineer (6 yrs, Chennai)
Node.js/TypeScript and Postgres; designed event-driven order pipeline handling 2M events/day.
Built and operated Kubernetes deployments on AWS (EKS) for 3 years; Docker daily.
Led on-call rotation and cut p99 latency 55% via query and cache redesign.
Mentored 4 juniors; no formal team-lead title. B.E. Computer Science, Anna University.`,
  },
  {
    id: "sample-3",
    name: "Sample Candidate 3",
    initials: "C3",
    headline: "Data Analyst · 4 yrs",
    resume: `Sample Candidate 3 — Data Analyst (4 yrs, Kochi/remote)
SQL, dbt and Python (pandas); built revenue attribution models used by a 30-person sales org.
Shipped exec dashboards in Metabase and Looker; A/B test design and readouts.
Automated weekly reporting, saving ~12 analyst-hours/week.
MSc Statistics. No production engineering or agile-delivery experience.`,
  },
  {
    id: "sample-4",
    name: "Sample Candidate 4",
    initials: "C4",
    headline: "Product Manager · 7 yrs",
    resume: `Sample Candidate 4 — Product Manager (7 yrs, Pune)
Owned B2B SaaS onboarding product line, ARR influence ₹14 Cr; shipped 3 zero-to-one modules.
Ran discovery, quarterly roadmaps and sprint ceremonies alongside engineering leads.
Strong stakeholder communication: board-level reviews, customer advisory councils.
Certified Scrum Product Owner (CSPO). Light technical depth — no hands-on coding or CI/CD.`,
  },
  {
    id: "sample-5",
    name: "Sample Candidate 5",
    initials: "C5",
    headline: "Full-stack Developer · 3 yrs",
    resume: `Sample Candidate 5 — Full-stack Developer (3 yrs, Goa/remote)
React, Next.js and Node; built customer portal used by 40k monthly users.
Set up GitHub Actions CI with test gates and preview deploys; Docker for local dev.
Contributed to sprint planning as senior-most dev on a 5-person squad.
Career gap of 10 months in 2024 (family care). BCA, Goa University.`,
  },
  {
    id: "sample-6",
    name: "Sample Candidate 6",
    initials: "C6",
    headline: "DevOps / SRE Lead · 8 yrs",
    resume: `Sample Candidate 6 — DevOps / SRE Lead (8 yrs, Hyderabad)
Ran platform team of 6; Kubernetes (EKS/GKE), Terraform, ArgoCD across 40+ services.
Cut cloud spend 31% via rightsizing and spot strategy; led incident process, MTTR down 45%.
Built CI/CD golden paths adopted by 12 product teams. CKA certified.
Owns quarterly risk reviews for infra; presents uptime and cost to CTO staff.`,
  },
  {
    id: "sample-7",
    name: "Sample Candidate 7",
    initials: "C7",
    headline: "Talent Acquisition Executive · 5 yrs",
    resume: `Sample Candidate 7 — Talent Acquisition Executive (5 yrs, Delhi-NCR)
Closed 120+ tech and non-tech roles across two startups; offer-to-join rate 87%.
Ran structured interview loops and trained 15 hiring managers on scorecards.
Sourcing across Naukri, LinkedIn and referrals; built referral programme that filled 1 in 4 roles.
Managed ATS migration (Lever → Greenhouse). MBA HR, Symbiosis.`,
  },
  {
    id: "sample-8",
    name: "Sample Candidate 8",
    initials: "C8",
    headline: "QA Automation Lead · 7 yrs",
    resume: `Sample Candidate 8 — QA Automation Lead (7 yrs, Pune)
Led QA guild of 9; built Playwright + API test suites cutting regression cycle from 3 days to 4 hours.
Introduced risk-based release gates and flake quarantine; escaped-defect rate down 60%.
Hands-on with CI pipelines (GitLab CI) and Docker-based test environments.
ISTQB Advanced. Coordinates release go/no-go with product and engineering leads.`,
  },
  {
    id: "sample-9",
    name: "Sample Candidate 9",
    initials: "C9",
    headline: "ML Engineer · 5 yrs",
    resume: `Sample Candidate 9 — ML Engineer (5 yrs, Bangalore)
Python, PyTorch; shipped ranking models serving 8M daily requests, latency p95 under 80ms.
Built LLM fine-tuning and eval pipelines; MLOps with MLflow, Airflow and Docker.
Published two applied-ML papers; mentors a reading group of 6 engineers.
M.Tech CSE, IIT Kharagpur. No people-management or delivery-process ownership.`,
  },
  {
    id: "sample-10",
    name: "Sample Candidate 10",
    initials: "C10",
    headline: "Enterprise Sales Manager · 6 yrs",
    resume: `Sample Candidate 10 — Enterprise Sales Manager (6 yrs, Mumbai)
Carried ₹6 Cr annual quota selling B2B SaaS to BFSI; 114% average attainment over 4 years.
Built and coached a 4-person AE pod; ran MEDDIC deal reviews and forecast calls.
Negotiated 3 multi-year enterprise renewals with procurement and legal.
Strong exec-level communication; no technical delivery or engineering background.`,
  },
];
