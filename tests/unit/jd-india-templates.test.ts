import { describe, it, expect } from "vitest";
import {
  getIndiaJdTemplates,
  findBestIndiaTemplate,
  getCategories,
  keywordMatchesJd,
} from "@/lib/fitscore/hybrid/jd-india-templates";

describe("India JD Templates v2.0", () => {
  it("loads 121 templates across 20 categories", () => {
    const templates = getIndiaJdTemplates();
    expect(templates.length).toBe(121);
    expect(getCategories().length).toBe(20);
  });

  it("each template has weights summing to 100", () => {
    for (const t of getIndiaJdTemplates()) {
      const sum = Object.values(t.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });

  it("each template has 7-8 dimension keys", () => {
    for (const t of getIndiaJdTemplates()) {
      const count = Object.keys(t.weights).length;
      expect(count).toBeGreaterThanOrEqual(7);
      expect(count).toBeLessThanOrEqual(8);
    }
  });

  it("findBestIndiaTemplate matches backend engineer JD", () => {
    const jd = `Senior Software Engineer (Backend) — We are looking for an experienced backend 
    developer with strong system design, database skills, REST APIs, microservices, 
    Docker, AWS, PostgreSQL, and Node.js expertise for our fintech platform.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.roleTitle.toLowerCase()).toContain("backend");
  });

  it("findBestIndiaTemplate matches scrum master JD", () => {
    const jd = `Scrum Master — Certified Scrum Master with experience facilitating agile 
    ceremonies, sprint planning, retrospectives, stakeholder management, Jira, SAFe.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.roleTitle.toLowerCase()).toContain("scrum");
  });

  it("findBestIndiaTemplate matches UX designer JD", () => {
    const jd = `User Experience Designer — Looking for a UX designer skilled in user research,
    wireframing, prototyping, Figma, design systems, accessibility, usability testing.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.category).toBe("Product & Design");
  });

  it("keywordMatchesJd does not treat salesforce as the word sales", () => {
    const jd = "salesforce service cloud and zendesk for customer support".toLowerCase();
    expect(keywordMatchesJd(jd, "sales")).toBe(false);
    expect(keywordMatchesJd(jd, "salesforce")).toBe(true);
  });

  it("IC Talent Acquisition Executive JD does NOT match the Talent Acquisition Lead template (india-058)", () => {
    const jd = `Talent Acquisition Executive
We are hiring a Talent Acquisition Executive to own end-to-end recruitment for our tech teams.
You will source candidates on Naukri and LinkedIn, screen resumes, schedule interviews,
manage the ATS, and coordinate offers. 1-3 years of recruitment experience required.`;
    const match = findBestIndiaTemplate(jd);
    // Leadership rubric (india-058) carries "no team management" red flags that would
    // hit every IC candidate; safer to fall through to LLM generation.
    expect(match?.template.id).not.toBe("india-058");
    expect(match).toBeNull();
  });

  it("Lead Business Analyst JD does NOT match the BPO / Call Center Team Lead template (india-064)", () => {
    const jd = `Lead Business Analyst
As Lead Business Analyst you will gather requirements, write BRDs, run stakeholder workshops,
build process maps, and work with engineering on delivery. You will act as team lead for two
junior analysts. Strong SQL and dashboarding skills preferred.`;
    const match = findBestIndiaTemplate(jd);
    expect(match?.template.id).not.toBe("india-064");
    // Since the analyst-title affinity, BA-shaped titles legitimately match an
    // analyst-family preset instead of matching nothing — assert the intent
    // (never the BPO or data-engineer template) rather than null.
    if (match) {
      expect(match.template.roleTitle.toLowerCase()).toContain("analyst");
      expect(match.template.roleTitle.toLowerCase()).not.toContain("data engineer");
    }
  });

  it("still matches a real Talent Acquisition Lead JD to india-058", () => {
    const jd = `Talent Acquisition Lead
Lead a team of recruiters. Own annual hiring volume, cost-per-hire, quality of hire,
and employer brand initiatives. Manage a team size of 5.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("india-058");
  });

  it("still matches a real Call Center Team Lead JD to india-064", () => {
    const jd = `Call Center Team Lead
Manage a BPO team. Track AHT, CSAT, FCR, shrinkage %, attrition management,
CRM usage and workforce scheduling.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("india-064");
  });

  it("still matches an IC Technical Recruiter JD to india-056", () => {
    const jd = `Technical Recruiter
Source engineers on Naukri/LinkedIn, manage the ATS, track hires/month, time-to-fill,
sourcing mix and offer acceptance rate. Tech stack knowledge required.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.id).toBe("india-056");
  });

  it("support-titled JD with Salesforce is not matched to Sales & Business Development", () => {
    const jd = `US Support Lead
Manage US customer support using Salesforce Service Cloud.
Work with sales on escalations. Track CSAT and churn.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.category).not.toBe("Sales & Business Development");
  });

  it("business analyst title with pipeline keywords prefers analyst preset over data engineer", () => {
    const jd = `Lead Business Analyst
Partner with data engineering on pipelines, data warehousing, and event tracking.
Strong SQL, Python, Tableau, funnel analysis, and business metrics.`;
    const match = findBestIndiaTemplate(jd);
    expect(match).not.toBeNull();
    expect(match!.template.roleTitle.toLowerCase()).toContain("analyst");
    expect(match!.template.roleTitle.toLowerCase()).not.toContain("data engineer");
  });
});
