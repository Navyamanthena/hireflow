import type { Analysis, Evidence } from './analysis.schema';
import type { LlmProvider } from './llm-provider';
import { SKILL_PATTERNS as SKILLS } from './skills';

/**
 * Offline, deterministic stand-in for the LLM. It matches a dictionary of
 * known tech skills, so the full pipeline can be run and tested without an
 * API key. Swap in a real provider via LLM_PROVIDER for semantic scoring.
 */


export class HeuristicProvider implements LlmProvider {
  readonly name = 'heuristic';
  readonly label = 'heuristic';

  async analyze(jobDescription: string, resumeText: string): Promise<Analysis> {
    const required = Object.entries(SKILLS).filter(([, re]) => re.test(jobDescription));
    const matched = required.filter(([, re]) => re.test(resumeText)).map(([s]) => s);
    const missing = required.filter(([, re]) => !re.test(resumeText)).map(([s]) => s);

    const score = required.length === 0 ? 50 : Math.round((matched.length / required.length) * 100);

    const reasons = [
      `Resume shows ${matched.length} of ${required.length} skills the job asks for.`,
    ];
    if (matched.length) reasons.push(`Strong overlap: ${matched.slice(0, 5).join(', ')}.`);
    if (missing.length) reasons.push(`Not evidenced: ${missing.slice(0, 5).join(', ')}.`);

    return {
      score,
      summary: `Keyword-based estimate (demo mode, no AI). ${matched.length}/${required.length} required skills matched.`,
      matchedSkills: matched,
      missingSkills: missing,
      reasons,
      evidence: findEvidence(resumeText, matched),
    };
  }
}

/** Quote the resume line where each matched skill appears. */
function findEvidence(resumeText: string, matched: string[]): Evidence[] {
  const lines = resumeText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Evidence[] = [];
  for (const skill of matched.slice(0, 40)) {
    const line = lines.find((l) => SKILLS[skill].test(l));
    if (!line) continue;
    const m = line.match(SKILLS[skill]);
    const at = m?.index ?? 0;
    const start = Math.max(0, at - 80);
    const quote = line.slice(start, start + 200).trim();
    if (quote.length >= 3) out.push({ skill, quote });
  }
  return out;
}
