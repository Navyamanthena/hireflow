import { OutboxEvent, ScoringEventType, ScoringJobData } from '@app/common';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ScoringProducer } from './scoring.producer';

const BATCH = 50;

/**
 * Moves outbox rows to the queue.
 *
 * - `kick()` runs right after a request commits, so the happy path has no delay.
 * - A timer re-runs it every second, which picks up anything a crash or a
 *   Redis outage left behind.
 * - `FOR UPDATE SKIP LOCKED` lets several API replicas relay in parallel
 *   without publishing the same row twice at the same time.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly producer: ScoringProducer,
  ) {}

  /** Call inside the business transaction: the event commits or rolls back with it. */
  static async enqueue(tx: EntityManager, type: ScoringEventType, payload: ScoringJobData) {
    return tx.save(tx.create(OutboxEvent, { type, payload: { ...payload } }));
  }

  onModuleInit() {
    const every = Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 1000);
    this.timer = setInterval(() => void this.kick(), every);
    this.timer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  /** Publish pending events now. Never throws; failures stay in the outbox for the next tick. */
  kick(): Promise<number> {
    if (!this.running) {
      this.running = this.publishPending()
        .catch((err) => {
          this.logger.warn(JSON.stringify({ event: 'outbox.relay.error', error: String(err) }));
          return 0;
        })
        .finally(() => (this.running = null));
    }
    return this.running;
  }

  /** Returns how many events were published. */
  async publishPending(): Promise<number> {
    return this.dataSource.transaction(async (tx) => {
      const rows: OutboxEvent[] = await tx
        .createQueryBuilder(OutboxEvent, 'o')
        .where('o.published_at IS NULL')
        .orderBy('o.created_at', 'ASC')
        .limit(BATCH)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      let published = 0;
      for (const row of rows) {
        try {
          await this.producer.publish(
            row.type as ScoringEventType,
            row.payload as unknown as ScoringJobData,
            row.id,
          );
          await tx.update(OutboxEvent, row.id, { publishedAt: new Date(), attempts: row.attempts + 1 });
          published++;
        } catch (err) {
          await tx.update(OutboxEvent, row.id, {
            attempts: row.attempts + 1,
            lastError: String(err).slice(0, 500),
          });
          this.logger.warn(
            JSON.stringify({ event: 'outbox.publish.failed', id: row.id, attempt: row.attempts + 1, error: String(err) }),
          );
          break; // the queue is probably down; stop and retry the batch next tick
        }
      }
      return published;
    });
  }

  /** Unpublished backlog size, surfaced on /api/health. */
  async pendingCount(): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM outbox_events WHERE published_at IS NULL`,
    );
    return row.n;
  }
}
