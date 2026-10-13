/** Queue + event names shared by the API (producer) and worker (consumer). */
export const SCORING_QUEUE = 'resume-scoring';

export const RESUME_UPLOADED = 'resume.uploaded';
export const RESUME_RESCORE = 'resume.rescore';

export interface ScoringJobData {
  candidateId: string;
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
