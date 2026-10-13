import {
  Candidate,
  createLlmProvider,
  databaseOptions,
  queuePrefix,
  redisConnection,
  SCORING_QUEUE,
} from '@app/common';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLM_PROVIDER, ScoringService } from './scoring.service';
import { ScoringProcessor } from './scoring.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => databaseOptions() }),
    TypeOrmModule.forFeature([Candidate]),
    BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: queuePrefix() }) }),
    BullModule.registerQueue({ name: SCORING_QUEUE }),
  ],
  providers: [
    ScoringService,
    ScoringProcessor,
    { provide: LLM_PROVIDER, useFactory: () => createLlmProvider() },
  ],
})
export class WorkerModule {}
