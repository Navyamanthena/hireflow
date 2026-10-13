import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CandidatesModule } from '../candidates/candidates.module';
import { ScoringProducer } from '../candidates/scoring.producer';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly queue: ScoringProducer,
  ) {}

  /**
   * Readiness probe: checks both dependencies and reports queue depth, so a
   * growing backlog (workers down or too few) is visible at a glance.
   */
  @Get()
  async check() {
    const [database, queue] = await Promise.all([
      this.db.query('SELECT 1').then(() => true, () => false),
      this.queue.stats().catch(() => null),
    ]);
    const body = {
      status: database && queue ? 'ok' : 'degraded',
      database,
      redis: !!queue,
      queue,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}

@Module({ imports: [CandidatesModule], controllers: [HealthController] })
export class HealthModule {}
