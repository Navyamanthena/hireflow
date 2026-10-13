import type { Analysis } from './analysis.schema';
import { skillPattern } from './skills';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Words too generic to show that a quote is about a particular skill. */
const GENERIC = new Set([
  'and', 'or', 'of', 'the', 'with', 'in', 'for', 'to', 'data', 'system', 'systems',
  'development', 'experience', 'skills', 'engineering', 'software', 'tools', 'basics',
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does this quote actually mention the skill? Known skills use their alias
 * pattern; anything else needs one of the skill's distinctive words to start
 * a word in the quote ("api" matches "APIs", "rest" matches "RESTful").
 * This is a lexical guard against irrelevant quotes, not proof of ability.
 */
export function quoteSupportsSkill(skill: string, quote: string): boolean {
  const pattern = skillPattern(skill);
  if (pattern) return pattern.test(quote);
  const words = normalize(skill)
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length >= 2 && !GENERIC.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  if (!words.length) return false;
  const q = normalize(quote);
  return words.some((w) => new RegExp(`(^|[^a-z0-9])${escape(w)}`).test(q));
}

/**
 * Check the model's evidence against the resume:
 *  1. Quotes must appear verbatim in the resume (case/whitespace/smart-quote
 *     tolerant); invented ones are dropped and counted.
 *  2. Every matched skill must be supported by at least one real quote that
 *     mentions it; skills without one are listed as unsupported.
 * The rules engine refuses to automate on either problem.
 */
export function verifyEvidence(analysis: Analysis, resumeText: string): Analysis {
  const haystack = normalize(resumeText);
  const present = analysis.evidence.filter((e) => haystack.includes(normalize(e.quote)));
  const unsupportedSkills = analysis.matchedSkills.filter(
    (skill) => !present.some((e) => quoteSupportsSkill(skill, e.quote)),
  );
  return {
    ...analysis,
    evidence: present,
    unverifiedEvidence: analysis.evidence.length - present.length,
    unsupportedSkills,
  };
}
