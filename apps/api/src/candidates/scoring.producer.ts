import {
  RESUME_RESCORE,
  RESUME_UPLOADED,
  SCORING_JOB_OPTIONS,
  SCORING_QUEUE,
  ScoringJobData,
} from '@app/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Publishes scoring events. The API never calls the LLM itself: it returns
 * immediately and the worker service does the slow, failure-prone work.
 */
@Injectable()
export class ScoringProducer {
  constructor(@InjectQueue(SCORING_QUEUE) private readonly queue: Queue<ScoringJobData>) {}

  async resumeUploaded(candidateId: string) {
    // jobId = candidateId makes the event idempotent: a duplicate publish is a no-op.
    await this.queue.add(RESUME_UPLOADED, { candidateId }, {
      ...SCORING_JOB_OPTIONS,
      jobId: `upload-${candidateId}`,
    });
  }

  async rescore(candidateId: string) {
    await this.queue.add(RESUME_RESCORE, { candidateId }, {
      ...SCORING_JOB_OPTIONS,
      jobId: `rescore-${candidateId}-${Date.now()}`,
    });
  }

  /**
   * Queue depth doubles as a Redis health check. BullMQ retries commands
   * forever while Redis is down, so cap the wait.
   */
  async stats(timeoutMs = 2000): Promise<Record<string, number>> {
    return Promise.race([
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), timeoutMs).unref(),
      ),
    ]);
  }
}
