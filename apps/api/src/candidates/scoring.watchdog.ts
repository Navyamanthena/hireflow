import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Safety net for scoring that can never finish on its own: a queue job that
 * exhausted its retries before it could even claim the candidate (database
 * outage), a job lost from Redis, or a worker that died mid-run. Without it,
 * such a candidate would show "Scoring…" forever.
 *
 * A row is stuck when it is PENDING/PROCESSING, untouched for
 * SCORING_STALE_MINUTES, and has no unpublished outbox event (those are
 * merely waiting for Redis and will still be delivered). Stuck rows become
 * FAILED with a clear message, so a recruiter can click "Score again".
 * A slow worker that later tries to write is rejected by the token/status check.
 */
@Injectable()
export class ScoringWatchdog implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScoringWatchdog.name);
  private timer?: NodeJS.Timeout;
  readonly staleMinutes = Number(process.env.SCORING_STALE_MINUTES ?? 15);

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    const every = Number(process.env.SCORING_WATCHDOG_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(() => void this.sweep().catch(() => undefined), every);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Returns the ids it recovered. Safe to run on several replicas at once. */
  async sweep(staleMinutes = this.staleMinutes): Promise<string[]> {
    try {
      const [rows] = await this.dataSource.query(
        `UPDATE candidates c
            SET scoring_status = 'FAILED',
                scoring_error = $2,
                scoring_attempt = NULL,
                updated_at = now()
          WHERE c.scoring_status IN ('PENDING', 'PROCESSING')
            AND c.updated_at < now() - make_interval(mins => $1)
            AND NOT EXISTS (
              SELECT 1 FROM outbox_events o
               WHERE o.published_at IS NULL AND o.payload->>'candidateId' = c.id::text
            )
        RETURNING c.id`,
        [staleMinutes, `Scoring did not finish within ${staleMinutes} minutes. Use "Score again" to retry.`],
      );
      const ids = rows.map((r: { id: string }) => r.id);
      if (ids.length) {
        this.logger.warn(JSON.stringify({ event: 'scoring.watchdog.recovered', count: ids.length, ids }));
      }
      return ids;
    } catch (err) {
      this.logger.warn(JSON.stringify({ event: 'scoring.watchdog.error', error: String(err) }));
      throw err;
    }
  }
}
