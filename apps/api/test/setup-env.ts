// Runs before any test module is imported, so decorators that read env at
// load time (e.g. the auth rate limit) see these values.
process.env.DATABASE_URL ??= 'postgres://hireflow:hireflow@localhost:5432/hireflow_test';
process.env.LLM_PROVIDER = 'heuristic';
process.env.OUTBOX_RELAY_INTERVAL_MS = '200';
process.env.QUEUE_PREFIX = 'hireflow-e2e'; // isolated from any running dev worker
process.env.JWT_SECRET = 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.AUTH_RATE_LIMIT = '25';
process.env.ALLOW_SIGNUP = 'true';
