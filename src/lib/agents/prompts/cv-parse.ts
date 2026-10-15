export const CV_PARSE_PROMPT = `You are a CV parsing expert. Extract structured data from the CV text below.
Return ONLY valid JSON with no markdown, no explanation, no preamble.

Extract these fields:
{
  "full_name": string,
  "email": string | null,
  "phone": string | null,
  "current_role": string,
  "current_company": string,
  "years_experience": number,
  "seniority_level": "junior" | "mid" | "senior" | "lead" | "head" | "vp" | "director" | "c-suite",
  "skills": [{"name": string, "verified": false, "source": "cv"}],
  "work_history": [{
    "company": string,
    "title": string,
    "start_date": string,
    "end_date": string | "present",
    "description": string
  }],
  "education": [{
    "institution": string,
    "degree": string,
    "year": string
  }],
  "location": string,
  "availability": "immediate" | "1_month" | "2_months" | "3_plus_months" | "not_looking",
  "salary_expectation_min": number | null,
  "salary_expectation_max": number | null,
  "raw_text": string,
  "authenticity_signals": {
    "specificity_score": number,
    "timeline_consistent": boolean,
    "flags": string[]
  }
}

CV TEXT:
{{CV_TEXT}}
`;

/** Prompt when sending the resume as a native PDF document (no pre-extracted text). */
export const CV_PARSE_PDF_PROMPT = `You are a CV parsing expert. The user has attached a resume as a PDF. Extract structured data from it.

Return ONLY valid JSON with no markdown, no explanation, no preamble. Use this exact shape:
{
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "current_title": string | null,
  "current_company": string | null,
  "years_experience": number,
  "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead" | "head" | "director" | "c-suite",
  "canonical_skills": string[],
  "location_city": string | null,
  "availability": "immediate" | "1_month" | "2_months" | "3_plus_months" | "not_looking",
  "salary_expectation_min": number | null,
  "salary_expectation_max": number | null,
  "authenticity_flags": string[],
  "raw_text": string
}

- canonical_skills: list of skill names (e.g. "React", "Python") inferred from the resume.
- years_experience: total relevant experience in years (integer).
- availability: infer from wording (e.g. "immediate", "2 weeks notice" -> "immediate", "1 month" -> "1_month").
- raw_text: CRITICAL — include the full plain-text body of the resume so downstream scoring can read it. Copy or transcribe all sections (experience, education, skills, summary). Do not omit or summarize. Keep under 15000 characters. If the PDF is image-based, transcribe what you see.
`;
