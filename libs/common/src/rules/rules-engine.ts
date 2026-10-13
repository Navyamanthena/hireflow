import { Stage } from '../entities/stage.enum';
import type { Analysis } from '../llm/analysis.schema';

export interface WorkflowRules {
  advanceThreshold: number;
  reviewThreshold: number;
}

export interface WorkflowDecision {
  toStage: Stage;
  reason: string;
  outreachDraft: string | null;
}

/**
 * Can the AI's claims be checked against the resume?
 * - Any quote the model invented (not found in the resume) is a red flag.
 * - Claiming matched skills while offering no verifiable quote is too.
 * Returns a human-readable problem, or null if the evidence holds up.
 */
export function evidenceProblem(analysis: Analysis): string | null {
  const unverified = analysis.unverifiedEvidence ?? 0;
  const verified = analysis.evidence?.length ?? 0;
  if (unverified > 0) {
    return `${unverified} of ${unverified + verified} AI-cited quotes were not found in the resume`;
  }
  if (analysis.matchedSkills.length > 0 && verified === 0) {
    return 'AI claimed matching skills but cited no quote from the resume';
  }
  return null;
}

/**
 * Pure workflow automation logic: given a score and a job's thresholds,
 * decide where the candidate goes next. Kept free of I/O so it is trivial
 * to unit test and reason about.
 *
 *   evidence can't be verified -> NEEDS_REVIEW (never auto-advance on unchecked claims)
 *   score >= advance           -> PHONE_SCREEN + outreach email draft
 *   score <  review            -> NEEDS_REVIEW (a human decides; AI never auto-rejects)
 *   otherwise                  -> SCREENED
 */
export function decideNextStage(
  analysis: Analysis,
  rules: WorkflowRules,
  candidate: { name: string },
  jobTitle: string,
): WorkflowDecision {
  const { score } = analysis;

  const problem = evidenceProblem(analysis);
  if (problem && score >= rules.reviewThreshold) {
    return {
      toStage: Stage.NEEDS_REVIEW,
      reason: `Held for human review: ${problem} (score ${score} not trusted for automation)`,
      outreachDraft: null,
    };
  }
  if (score >= rules.advanceThreshold) {
    return {
      toStage: Stage.PHONE_SCREEN,
      reason: `Auto-advanced: score ${score} >= advance threshold ${rules.advanceThreshold}`,
      outreachDraft: draftOutreach(candidate.name, jobTitle, analysis.matchedSkills),
    };
  }
  if (score < rules.reviewThreshold) {
    return {
      toStage: Stage.NEEDS_REVIEW,
      reason: `Flagged for human review: score ${score} < review threshold ${rules.reviewThreshold}`,
      outreachDraft: null,
    };
  }
  return {
    toStage: Stage.SCREENED,
    reason: `Screened: score ${score} between thresholds`,
    outreachDraft: null,
  };
}

export function draftOutreach(name: string, jobTitle: string, matchedSkills: string[]): string {
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const skills = matchedSkills.slice(0, 3);
  const skillLine = skills.length
    ? ` Your experience with ${formatList(skills)} stood out to our team.`
    : '';
  return `Hi ${firstName},

Thanks for applying for the ${jobTitle} role.${skillLine} We'd love to set up a 30-minute phone screen to learn more about your work.

Could you share a few times that work for you this week?

Best,
The Hiring Team`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function validateThresholds(rules: WorkflowRules): string | null {
  if (rules.reviewThreshold > rules.advanceThreshold) {
    return 'reviewThreshold must be less than or equal to advanceThreshold';
  }
  return null;
}
