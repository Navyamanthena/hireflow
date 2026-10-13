import { z } from 'zod';

/**
 * The contract between the worker and the LLM. Model output is untrusted,
 * so every response is validated against this schema before it touches the DB.
 */
export const EvidenceSchema = z.object({
  skill: z.string().min(1).max(80),
  /** A short verbatim excerpt from the resume that supports the skill. */
  quote: z.string().min(3).max(240),
});

export const AnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(1000),
  matchedSkills: z.array(z.string().min(1).max(80)).max(40),
  missingSkills: z.array(z.string().min(1).max(80)).max(40),
  reasons: z.array(z.string().min(1).max(300)).min(1).max(6),
  evidence: z.array(EvidenceSchema).max(10).default([]),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Analysis = z.infer<typeof AnalysisSchema> & {
  /** How many model-supplied quotes were dropped because they are not in the resume. */
  unverifiedEvidence?: number;
  /** Set when automation was withheld because the AI's claims couldn't be verified. */
  reviewReason?: string;
};

/** Pull the first JSON object out of a model response (handles ```json fences). */
export function parseAnalysis(raw: string): Analysis {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('LLM response did not contain a JSON object');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('LLM response contained malformed JSON');
  }
  // Models sometimes return a float score; round before validating.
  if (json && typeof json === 'object' && typeof (json as any).score === 'number') {
    (json as any).score = Math.round((json as any).score);
  }
  const result = AnalysisSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`LLM response failed validation: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\S\n]+|\n+/g, ' ')
    .trim();

/**
 * Keep only quotes that actually appear in the resume. A model can invent a
 * convincing quote; this makes every excerpt shown to a recruiter checkable.
 */
export function verifyEvidence(analysis: Analysis, resumeText: string): Analysis {
  const haystack = normalize(resumeText);
  const verified = analysis.evidence.filter((e) => haystack.includes(normalize(e.quote)));
  return {
    ...analysis,
    evidence: verified,
    unverifiedEvidence: analysis.evidence.length - verified.length,
  };
}
