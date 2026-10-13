import { SCORING_JOB_OPTIONS, SCORING_QUEUE, ScoringEventType, ScoringJobData } from '@app/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

/** BullMQ retries commands forever while Redis is down, so every call is time-boxed. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}

/**
 * Thin wrapper over the queue. Only the outbox relay publishes through it;
 * request handlers write outbox rows instead of talking to Redis directly.
 */
@Injectable()
export class ScoringProducer {
  constructor(@InjectQueue(SCORING_QUEUE) private readonly queue: Queue<ScoringJobData>) {}

  /**
   * jobId = outbox event id, so if the relay publishes the same event twice
   * (crash after publish, before marking it sent) BullMQ ignores the duplicate.
   */
  async publish(type: ScoringEventType, data: ScoringJobData, eventId: string, timeoutMs = 2000) {
    await withTimeout(
      this.queue.add(type, data, { ...SCORING_JOB_OPTIONS, jobId: eventId }),
      timeoutMs,
      'Queue publish',
    );
  }

  /** Queue depth doubles as a Redis health check. */
  stats(timeoutMs = 2000): Promise<Record<string, number>> {
    return withTimeout(
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
      timeoutMs,
      'Redis',
    );
  }
}
