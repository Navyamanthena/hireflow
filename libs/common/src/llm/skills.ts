/**
 * Canonical tech skills and the patterns that recognise them, including
 * aliases (e.g. Prometheus counts as Observability). Shared by the offline
 * heuristic scorer and by evidence checking, so both agree on what a quote
 * "mentions".
 */
export const SKILL_PATTERNS: Record<string, RegExp> = {
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

/** Case-insensitive lookup of a canonical skill pattern. */
export function skillPattern(skill: string): RegExp | undefined {
  const key = Object.keys(SKILL_PATTERNS).find((k) => k.toLowerCase() === skill.trim().toLowerCase());
  return key ? SKILL_PATTERNS[key] : undefined;
}
