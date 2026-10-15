/**
 * Authenticity check: AI-generation detection on CV/cover letter text.
 * Phase 1: Simple heuristics based on perplexity, sentence structure, and keyword density.
 */

export type AuthenticitySignal = "likely_authentic" | "review_carefully" | "likely_ai_generated";
export type HumanSignal = AuthenticitySignal;

interface DetectionResult {
  signal: AuthenticitySignal;
  confidence: number;
  reasons: string[];
}

/**
 * Detect AI-generation signals in CV/cover letter text.
 * Returns an authenticity signal with confidence and reasons.
 */
export function detectAuthenticitySignal(text: string, jobDescription?: string): DetectionResult {
  if (!text || text.trim().length < 50) {
    return {
      signal: "review_carefully",
      confidence: 0.5,
      reasons: ["Text too short to analyse"],
    };
  }

  const reasons: string[] = [];
  let aiScore = 0;
  let humanScore = 0;

  // 1. Sentence structure entropy (AI tends to have more uniform sentence lengths)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length > 5) {
    const lengths = sentences.map((s) => s.trim().length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    // Low variance = more uniform = likely AI
    if (stdDev < 20) {
      aiScore += 2;
      reasons.push("Uniform sentence structure");
    } else {
      humanScore += 1;
    }
  }

  // 2. Personal specificity (human CVs have specific details, AI is generic)
  const personalMarkers = [
    /\d{4}/g, // Years (e.g., 2020, 2019)
    /\b\d+\s*(years?|months?)\b/gi, // Duration mentions
    /\b(worked|joined|left|started|completed)\b/gi, // Action verbs with context
    /\b[A-Z][a-z]+\s+(University|College|School|Institute)\b/g, // Specific institutions
  ];
  const personalCount = personalMarkers.reduce(
    (count, pattern) => count + (text.match(pattern)?.length ?? 0),
    0,
  );
  if (personalCount < 3) {
    aiScore += 1.5;
    reasons.push("Lacks specific personal details");
  } else {
    humanScore += 1.5;
  }

  // 3. Keyword density vs JD (AI mirrors JD too closely)
  if (jobDescription) {
    const jdWords = new Set(
      jobDescription
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4),
    );
    const cvWords = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    const matchingWords = cvWords.filter((w) => jdWords.has(w));
    const matchRatio = matchingWords.length / Math.max(cvWords.length, 1);

    // Very high match ratio (>0.4) suggests AI optimization
    if (matchRatio > 0.4) {
      aiScore += 2;
      reasons.push("Keyword density mirrors job description too closely");
    } else if (matchRatio > 0.25) {
      aiScore += 1;
      reasons.push("High keyword overlap with job description");
    } else {
      humanScore += 0.5;
    }
  }

  // 4. Perplexity indicators (AI text often lacks natural variation)
  const commonPhrases = [
    /\b(proven track record|results-driven|highly motivated|team player|detail-oriented)\b/gi,
  ];
  const phraseCount = commonPhrases.reduce(
    (count, pattern) => count + (text.match(pattern)?.length ?? 0),
    0,
  );
  if (phraseCount > 5) {
    aiScore += 1;
    reasons.push("Excessive use of generic phrases");
  }

  // 5. Natural language markers (contractions, informal structures, typos)
  const naturalMarkers = [
    /\b(I|we|my|our)\b/gi, // First person (common in human CVs)
    /'[a-z]+/gi, // Contractions
    /[a-z]{2,}[A-Z][a-z]+/g, // Mixed case (potential typos/formatting quirks)
  ];
  const naturalCount = naturalMarkers.reduce(
    (count, pattern) => count + (text.match(pattern)?.length ?? 0),
    0,
  );
  if (naturalCount > 3) {
    humanScore += 1;
  }

  // Calculate final signal
  const totalScore = aiScore + humanScore;
  const aiRatio = totalScore > 0 ? aiScore / totalScore : 0.5;

  let signal: AuthenticitySignal;
  if (aiRatio >= 0.6) {
    signal = "likely_ai_generated";
  } else if (aiRatio >= 0.4) {
    signal = "review_carefully";
  } else {
    signal = "likely_authentic";
  }

  return {
    signal,
    confidence: Math.abs(aiRatio - 0.5) * 2, // 0-1 scale
    reasons: reasons.length > 0 ? reasons : ["No strong indicators detected"],
  };
}

// Backward-compatible export for older call sites.
export const detectHumanSignal = detectAuthenticitySignal;
