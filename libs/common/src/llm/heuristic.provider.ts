import type { Analysis, Evidence } from './analysis.schema';
import type { LlmProvider } from './llm-provider';

/**
 * Offline, deterministic stand-in for the LLM. It matches a dictionary of
 * known tech skills, so the full pipeline can be run and tested without an
 * API key. Swap in a real provider via LLM_PROVIDER for semantic scoring.
 */
const SKILLS: Record<string, RegExp> = {
  JavaScript: /\bjavascript\b|(?<![.\w])js\b/i, // not the 'js' in Node.js
  TypeScript: /\btypescript\b|(?<![.\w])ts\b/i,
  React: /\breact(\.js)?\b/i,
  'Node.js': /\bnode(\.js|js)?\b/i,
  NestJS: /\bnest(\.js|js)\b/i,
  Express: /\bexpress(\.js)?\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b(?!script)/i,
  Go: /\bgolang\b|\bgo\b(?=[\s,/)|])/,
  SQL: /\bsql\b/i,
  PostgreSQL: /\bpostgres(ql)?\b/i,
  MySQL: /\bmysql\b/i,
  MongoDB: /\bmongo(db)?\b/i,
  Redis: /\bredis\b/i,
  GraphQL: /\bgraphql\b/i,
  'REST APIs': /\brest(ful)?\b/i,
  Microservices: /\bmicro-?services?\b/i,
  'Event-driven': /\bevent[- ]driven\b/i,
  Serverless: /\bserverless\b/i,
  AWS: /\baws\b|amazon web services/i,
  GCP: /\bgcp\b|google cloud/i,
  Azure: /\bazure\b/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b/i,
  'CI/CD': /\bci\/cd\b|continuous (integration|delivery|deployment)|github actions/i,
  Git: /\bgit\b|github/i,
  Testing: /\b(unit|integration|e2e) test|\bjest\b|\bpytest\b|\bjunit\b|\btesting\b/i,
  'Data modeling': /data model|schema design/i,
  'Query optimization': /query (optimization|performance)|index(es|ing)?\b/i,
  Observability: /observab|prometheus|grafana|opentelemetry|monitoring/i,
  'AI/LLM': /\bllm\b|\bai\b|openai|anthropic|machine learning|\bgpt\b/i,
  'Workflow automation': /workflow automation|automat(e|ed|ion) (workflow|pipeline)/i,
  Kafka: /\bkafka\b/i,
  'System design': /system design|distributed systems?/i,
};

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

/** Quote the resume line where each matched skill appears (first 6 skills). */
function findEvidence(resumeText: string, matched: string[]): Evidence[] {
  const lines = resumeText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Evidence[] = [];
  for (const skill of matched.slice(0, 6)) {
    const line = lines.find((l) => SKILLS[skill].test(l));
    if (!line) continue;
    const m = line.match(SKILLS[skill]);
    const at = m?.index ?? 0;
    const start = Math.max(0, at - 80);
    const quote = line.slice(start, start + 200).trim();
    if (quote.length >= 3 && !out.some((e) => e.quote === quote)) out.push({ skill, quote });
  }
  return out;
}
