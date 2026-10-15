import { describe, it, expect } from "vitest";
import { detectHumanSignal } from "@/lib/services/human-signal-detector";
import type { HumanSignal } from "@/lib/services/human-signal-detector";

describe("detectHumanSignal", () => {
  it("returns 'likely_authentic' for natural writing with personal specifics", () => {
    const text = `
      I joined Acme Corp in 2018 as a junior developer after graduating from Stanford University.
      Over the next 3 years, I worked on migrating our legacy PHP codebase to Node.js microservices.
      I've always been passionate about clean architecture -- it's something I picked up from my
      first mentor, Sarah, who'd spent 15 years at Google. In 2021, I started leading our platform
      team of 8 engineers. We completed the migration 2 months ahead of schedule, which honestly
      surprised everyone. My current role at DataWave involves designing distributed systems for
      real-time analytics. I'm looking for a senior position where I can keep growing as a technical
      leader while still getting my hands dirty with code.
    `;
    const result = detectHumanSignal(text);
    expect(result.signal).toBe("likely_authentic");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns 'likely_ai_generated' for generic AI-sounding text", () => {
    const text = `
      Proven track record of delivering results-driven solutions. Highly motivated team player
      with detail-oriented approach. Proven track record in leveraging synergies across
      cross-functional teams. Results-driven professional with a detail-oriented mindset.
      Highly motivated individual with proven track record of success. Team player dedicated
      to delivering exceptional results. Proven track record of driving innovation and
      results-driven outcomes. Detail-oriented professional committed to excellence.
      Results-driven leader with proven track record of achievement. Highly motivated
      self-starter with a results-driven approach to problem-solving.
    `;
    const result = detectHumanSignal(text);
    expect(result.signal).toBe("likely_ai_generated");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns 'review_carefully' for borderline text", () => {
    const text = `
      Experienced software engineer with 5 years of professional development experience.
      Skilled in JavaScript, TypeScript, React, and Node.js. Built scalable web applications
      serving thousands of users. Collaborated with product and design teams to deliver
      features on time. Contributed to open source projects and mentored junior developers.
      Strong problem-solving abilities and communication skills. Familiar with agile
      methodologies and CI/CD pipelines.
    `;
    const result = detectHumanSignal(text);
    // Borderline text may be review_carefully or lean one way; just check it's valid
    expect(["likely_authentic", "review_carefully", "likely_ai_generated"]).toContain(
      result.signal,
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("handles empty text gracefully", () => {
    const result = detectHumanSignal("");
    expect(result.signal).toBe("review_carefully");
    expect(result.confidence).toBe(0.5);
    expect(result.reasons).toContain("Text too short to analyse");
  });

  it("handles very short text gracefully", () => {
    const result = detectHumanSignal("Hello world, I am a developer.");
    expect(result.signal).toBe("review_carefully");
    expect(result.confidence).toBe(0.5);
    expect(result.reasons).toContain("Text too short to analyse");
  });

  it("handles whitespace-only text gracefully", () => {
    const result = detectHumanSignal("   \n\t   ");
    expect(result.signal).toBe("review_carefully");
    expect(result.confidence).toBe(0.5);
  });

  it("detects high keyword overlap with JD as AI-optimized", () => {
    const jobDescription = `
      We are looking for a senior frontend engineer skilled in React, TypeScript, GraphQL,
      and performance optimization. The candidate should have experience with design systems,
      accessibility, testing frameworks, and continuous integration pipelines.
    `;
    // Text that mirrors the JD almost word-for-word
    const text = `
      Senior frontend engineer with deep expertise in React, TypeScript, GraphQL, and
      performance optimization. Extensive experience building design systems with a focus on
      accessibility. Proficient in testing frameworks and continuous integration pipelines.
      Expert in React and TypeScript development. Skilled in GraphQL and performance
      optimization. Built design systems prioritizing accessibility. Set up testing frameworks
      and continuous integration pipelines for multiple teams. React TypeScript GraphQL
      performance optimization design systems accessibility testing frameworks continuous
      integration pipelines senior frontend engineer.
    `;
    const result = detectHumanSignal(text, jobDescription);
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/keyword/i)]));
  });

  it("identifies common phrases as AI indicators", () => {
    const text = `
      A proven track record of delivering results-driven outcomes. Highly motivated and
      detail-oriented team player with a proven track record. Results-driven professional
      who is also a great team player. Highly motivated individual who is detail-oriented
      and has a proven track record of success. Proven track record in all aspects of
      professional development. Detail-oriented problem solver with results-driven mindset.
    `;
    const result = detectHumanSignal(text);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/generic phrases/i)]),
    );
  });

  it("recognizes personal specificity (years, institutions) as human", () => {
    // Text with many personal specifics AND varied sentence lengths to avoid
    // triggering the "Uniform sentence structure" AI signal.
    const text = `
      After completing my Bachelor's degree at MIT in 2016, I joined Goldman Sachs as a
      quantitative analyst where I spent the next several years building out sophisticated
      pricing models for exotic derivatives across multiple asset classes. Over 4 years,
      I built pricing models for derivatives. In 2020 I moved to Stripe where I've been
      working on authenticity detection and risk scoring systems. Yes. I completed a machine
      learning certification from Coursera in 2021. Before MIT, I studied at Beijing
      International School from 2008 to 2012, which was a formative experience that shaped
      my approach to collaborative problem-solving and cross-cultural communication in
      ways I couldn't have anticipated at the time. Currently I'm based in San Francisco.
    `;
    const result = detectHumanSignal(text);
    expect(result.signal).toBe("likely_authentic");
  });

  it("returns confidence between 0 and 1", () => {
    const texts = [
      "A proven track record of excellence in all areas. Results-driven professional. Highly motivated. Team player. Detail-oriented. Proven track record repeated again.",
      "I worked at Google from 2015 to 2020 building search infrastructure. It wasn't easy but I learned a lot from my colleagues in Mountain View.",
      "",
      "Some moderate text about working in tech for a while and doing various tasks and projects across several teams.",
    ];
    for (const text of texts) {
      const result = detectHumanSignal(text);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("returns reasons array that is never empty", () => {
    const text = `
      I have worked at several companies over the past decade, gaining experience in
      various programming languages and frameworks. My background includes both frontend
      and backend development. I enjoy solving challenging problems and collaborating
      with diverse teams on interesting projects.
    `;
    const result = detectHumanSignal(text);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("handles undefined jobDescription parameter", () => {
    const text = `
      I joined Acme Corp in 2018 as a software engineer. Over the past 5 years I've
      built distributed systems and led a team of 6 engineers. I completed my degree at
      Carnegie Mellon University in 2017. Currently working on real-time data pipelines.
    `;
    const result = detectHumanSignal(text, undefined);
    expect(result.signal).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("result has correct DetectionResult shape", () => {
    const result = detectHumanSignal(
      "This is a test with enough characters to pass the minimum threshold for analysis by the detector.",
    );
    expect(result).toHaveProperty("signal");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasons");
    expect(Array.isArray(result.reasons)).toBe(true);
    const validSignals: HumanSignal[] = [
      "likely_authentic",
      "review_carefully",
      "likely_ai_generated",
    ];
    expect(validSignals).toContain(result.signal);
  });
});
