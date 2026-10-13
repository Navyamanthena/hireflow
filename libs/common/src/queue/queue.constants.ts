/** Queue + event names shared by the API (producer) and worker (consumer). */
export const SCORING_QUEUE = 'resume-scoring';

export const RESUME_UPLOADED = 'resume.uploaded';
export const RESUME_RESCORE = 'resume.rescore';
export type ScoringEventType = typeof RESUME_UPLOADED | typeof RESUME_RESCORE;

export interface ScoringJobData {
  candidateId: string;
  /** The candidate.scoring_version this request was issued for. */
  version: number;
}

/** Retries with exponential backoff; failed jobs are kept as a dead-letter set. */
export const SCORING_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: false,
};

export function redisConnection(env: NodeJS.ProcessEnv = process.env) {
  return {
    host: env.REDIS_HOST ?? 'localhost',
    port: Number(env.REDIS_PORT ?? 6379),
  };
}

/**
 * Namespace for all BullMQ keys. Give tests and each environment their own
 * prefix so a dev worker can never consume test jobs (or vice versa) when
 * they share one Redis.
 */
export function queuePrefix(env: NodeJS.ProcessEnv = process.env) {
  return env.QUEUE_PREFIX || 'hireflow';
}
