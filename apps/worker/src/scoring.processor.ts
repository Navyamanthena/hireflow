import { SCORING_QUEUE, ScoringJobData } from '@app/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ScoringService } from './scoring.service';

/**
 * Consumes resume.uploaded / resume.rescore events.
 * Retries use exponential backoff (see SCORING_JOB_OPTIONS); errors that a
 * retry cannot fix (bad API key, 4xx) fail fast instead of burning attempts.
 * Jobs that exhaust retries stay in BullMQ's failed set as a dead-letter queue.
 */
@Processor(SCORING_QUEUE, { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) })
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(private readonly scoring: ScoringService) {
    super();
  }

  async process(job: Job<ScoringJobData>) {
    const { candidateId, version } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    const token = await this.scoring.claim(candidateId, version);
    if (!token) {
      const outcome = { kind: 'skipped', reason: 'superseded, deleted or already finished' };
      this.logger.log(JSON.stringify({ event: job.name, candidateId, version, attempt, outcome }));
      return outcome;
    }

    try {
      const outcome = await this.scoring.run(candidateId, token);
      this.logger.log(JSON.stringify({ event: job.name, candidateId, version, attempt, outcome }));
      return outcome;
    } catch (error) {
      const permanent = ScoringService.isPermanent(error);
      const lastAttempt = permanent || attempt >= maxAttempts;
      this.logger.warn(
        JSON.stringify({
          event: `${job.name}.error`,
          candidateId,
          attempt,
          maxAttempts,
          permanent,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (lastAttempt) {
        await this.scoring.markFailed(candidateId, token, error);
        if (permanent) throw new UnrecoverableError((error as Error).message);
      }
      throw error;
    }
  }
}
