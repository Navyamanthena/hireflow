import { Stage } from '../entities/stage.enum';
import type { Analysis } from '../llm/analysis.schema';
import { decideNextStage, draftOutreach, validateThresholds } from './rules-engine';

const analysis = (score: number, matchedSkills: string[] = ['TypeScript']): Analysis => ({
  score,
  summary: 'test',
  matchedSkills,
  missingSkills: [],
  reasons: ['test'],
  evidence: [],
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
