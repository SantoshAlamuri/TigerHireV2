/** Human-readable labels for hybrid scoring dimension keys. */
const DIMENSION_LABELS: Record<string, string> = {
  test_strategy: "Test Strategy & Design",
  api_testing: "API Testing",
  tools: "Tools & Practices",
  years_exp: "Years & Experience Level",
  test_automation: "Test Automation",
  cicd_integration: "CI/CD Integration",
  performance_testing: "Performance Testing",
  programming: "Programming",
  core_language: "Core Language",
  system_design: "System Design",
  sql: "SQL",
};

export function formatDimensionLabel(key: string): string {
  if (DIMENSION_LABELS[key]) return DIMENSION_LABELS[key];
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
