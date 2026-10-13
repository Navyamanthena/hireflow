import { Stage } from '../entities/stage.enum';
import type { Analysis } from '../llm/analysis.schema';
import { decideNextStage, draftOutreach, evidenceProblem, validateThresholds } from './rules-engine';

const analysis = (score: number, matchedSkills: string[] = ['TypeScript']): Analysis => ({
  score,
  summary: 'test',
  matchedSkills,
  missingSkills: [],
  reasons: ['test'],
  evidence: [{ skill: matchedSkills[0] ?? 'x', quote: 'verified quote' }],
  unverifiedEvidence: 0,
});
const rules = { advanceThreshold: 80, reviewThreshold: 50 };
const candidate = { name: 'Navya Manthena' };

describe('decideNextStage', () => {
  it('auto-advances at exactly the advance threshold and drafts outreach', () => {
    const d = decideNextStage(analysis(80), rules, candidate, 'SWE');
    expect(d.toStage).toBe(Stage.PHONE_SCREEN);
    expect(d.outreachDraft).toContain('Hi Navya');
  });

  it('routes scores below the review threshold to a human, never to REJECTED', () => {
    const d = decideNextStage(analysis(49), rules, candidate, 'SWE');
    expect(d.toStage).toBe(Stage.NEEDS_REVIEW);
    expect(d.outreachDraft).toBeNull();
  });

  it('marks in-between scores as SCREENED', () => {
    expect(decideNextStage(analysis(50), rules, candidate, 'SWE').toStage).toBe(Stage.SCREENED);
    expect(decideNextStage(analysis(79), rules, candidate, 'SWE').toStage).toBe(Stage.SCREENED);
  });

  it('respects per-job thresholds', () => {
    const strict = { advanceThreshold: 95, reviewThreshold: 70 };
    expect(decideNextStage(analysis(90), strict, candidate, 'SWE').toStage).toBe(Stage.SCREENED);
    expect(decideNextStage(analysis(65), strict, candidate, 'SWE').toStage).toBe(Stage.NEEDS_REVIEW);
  });
});

describe('evidence gate', () => {
  it('never auto-advances when the model invented quotes', () => {
    const d = decideNextStage({ ...analysis(95), unverifiedEvidence: 2 }, rules, candidate, 'SWE');
    expect(d.toStage).toBe(Stage.NEEDS_REVIEW);
    expect(d.outreachDraft).toBeNull();
    expect(d.reason).toMatch(/2 of 3 AI-cited quotes were not found/);
  });

  it('never auto-advances on matched skills with zero verified quotes', () => {
    const d = decideNextStage({ ...analysis(95), evidence: [] }, rules, candidate, 'SWE');
    expect(d.toStage).toBe(Stage.NEEDS_REVIEW);
    expect(d.reason).toMatch(/cited no quote/);
  });

  it('also holds mid-range scores instead of marking them SCREENED', () => {
    expect(decideNextStage({ ...analysis(60), evidence: [] }, rules, candidate, 'SWE').toStage).toBe(
      Stage.NEEDS_REVIEW,
    );
  });

  it('accepts no evidence when nothing was claimed', () => {
    expect(evidenceProblem({ ...analysis(10, []), evidence: [] })).toBeNull();
  });
});

describe('draftOutreach', () => {
  it('mentions up to three matched skills', () => {
    const text = draftOutreach('Navya', 'SWE', ['TypeScript', 'React', 'PostgreSQL', 'AWS']);
    expect(text).toContain('TypeScript, React and PostgreSQL');
    expect(text).not.toContain('AWS');
  });

  it('handles no matched skills and blank names', () => {
    const text = draftOutreach('  ', 'SWE', []);
    expect(text).toContain('Hi there');
    expect(text).not.toContain('stood out');
  });
});

describe('validateThresholds', () => {
  it('rejects review threshold above advance threshold', () => {
    expect(validateThresholds({ advanceThreshold: 60, reviewThreshold: 70 })).toMatch(/must be/);
    expect(validateThresholds({ advanceThreshold: 70, reviewThreshold: 70 })).toBeNull();
  });
});
