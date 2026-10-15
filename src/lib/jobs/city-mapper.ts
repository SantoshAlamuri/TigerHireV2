import type { City } from "./types";

const REMOTE_PATTERNS = ["remote", "work from home", "wfh", "anywhere in india", "india remote"];

const CITY_PATTERNS: Array<{ city: City; patterns: string[] }> = [
  {
    city: "bangalore",
    patterns: [
      "bangalore",
      "bengaluru",
      "bangalore urban",
      "whitefield",
      "electronic city",
      "koramangala",
    ],
  },
  {
    city: "delhi_ncr",
    patterns: [
      "delhi",
      "new delhi",
      "gurgaon",
      "gurugram",
      "noida",
      "faridabad",
      "ghaziabad",
      "ncr",
    ],
  },
  { city: "mumbai", patterns: ["mumbai", "navi mumbai", "thane"] },
  { city: "hyderabad", patterns: ["hyderabad", "secunderabad", "hitech city"] },
  { city: "chennai", patterns: ["chennai"] },
  { city: "pune", patterns: ["pune", "pimpri", "chinchwad"] },
];

const INDIA_HINTS = ["india", "bharat", "in"];
const NON_INDIA_HINTS = [
  "united states",
  "usa",
  "uk",
  "united kingdom",
  "canada",
  "europe",
  "germany",
  "singapore",
  "australia",
];

export function mapCityFromLocation(input: string | null | undefined): City | null {
  if (!input) return null;
  const normalized = normalizeLocation(input);
  if (!normalized) return null;

  if (REMOTE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "remote";
  }

  if (NON_INDIA_HINTS.some((hint) => normalized.includes(hint))) {
    return null;
  }

  for (const entry of CITY_PATTERNS) {
    if (entry.patterns.some((pattern) => normalized.includes(pattern))) {
      return entry.city;
    }
  }

  // If it mentions India but not one of curated cities, we still drop it.
  if (INDIA_HINTS.some((hint) => normalized === hint || normalized.includes(` ${hint} `))) {
    return null;
  }

  return null;
}

function normalizeLocation(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
