import type { FitScore } from "@/types";
import { mockFitScoresPart1 } from "./fit-scores-part1";
import { mockFitScoresPart2 } from "./fit-scores-part2";
import { mockFitScoresPart3 } from "./fit-scores-part3";

export const mockFitScores: FitScore[] = [
  ...mockFitScoresPart1,
  ...mockFitScoresPart2,
  ...mockFitScoresPart3,
];
