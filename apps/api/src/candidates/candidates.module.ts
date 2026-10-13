import { Candidate, SCORING_QUEUE } from '@app/common';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { ScoringProducer } from './scoring.producer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Candidate]),
    BullModule.registerQueue({ name: SCORING_QUEUE }),
    JobsModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService, ScoringProducer],
  exports: [ScoringProducer],
})
export class CandidatesModule {}
