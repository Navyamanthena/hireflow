import { describeLlmConfig } from '@app/common';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.decorators';
import { CandidatesModule } from '../candidates/candidates.module';
import { OutboxRelay } from '../candidates/outbox.relay';
import { ScoringProducer } from '../candidates/scoring.producer';

/** Probes and public config: no token required. */
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly queue: ScoringProducer,
    private readonly relay: OutboxRelay,
  ) {}

  /**
   * Readiness probe. Reports queue depth and the outbox backlog: a growing
   * `outboxPending` means events can't reach Redis; a growing `waiting`
   * means there are too few workers.
   */
  @Get('health')
  async check() {
    const [database, queue, outboxPending] = await Promise.all([
      this.db.query('SELECT 1').then(() => true, () => false),
      this.queue.stats().catch(() => null),
      this.relay.pendingCount().catch(() => null),
    ]);
    const body = {
      status: database && queue ? 'ok' : 'degraded',
      database,
      redis: !!queue,
      queue,
      outboxPending,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }

  /** Lets the UI say plainly when it is running in demo (keyword) mode. */
  @Get('config')
  config() {
    return { scoring: describeLlmConfig() };
  }
}

@Module({ imports: [CandidatesModule], controllers: [HealthController] })
export class HealthModule {}
