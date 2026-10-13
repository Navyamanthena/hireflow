import { databaseOptions, queuePrefix, redisConnection } from '@app/common';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatesModule } from './candidates/candidates.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      // The API owns the schema: it applies pending migrations on boot.
      useFactory: () => ({ ...databaseOptions(), migrationsRun: true }),
    }),
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnection(), prefix: queuePrefix() }),
    }),
    JobsModule,
    CandidatesModule,
    HealthModule,
  ],
})
export class AppModule {}
