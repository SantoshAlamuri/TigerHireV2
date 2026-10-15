import type { Candidate } from "@/types";
import { mockCandidatesPart1 } from "./candidates-part1";
import { mockCandidatesPart2 } from "./candidates-part2";

export const mockCandidates: Candidate[] = [...mockCandidatesPart1, ...mockCandidatesPart2];
