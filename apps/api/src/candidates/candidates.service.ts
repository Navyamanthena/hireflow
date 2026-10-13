import { Candidate, ScoringStatus, Stage, StageEvent } from '@app/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JobsService } from '../jobs/jobs.service';
import { CreateCandidateDto, MoveStageDto } from './candidates.dto';
import { ScoringProducer } from './scoring.producer';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate) private readonly candidates: Repository<Candidate>,
    private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly scoring: ScoringProducer,
  ) {}

  /** Save the candidate + its first audit event atomically, then emit the event. */
  async create(jobId: string, dto: CreateCandidateDto): Promise<Candidate> {
    await this.jobs.findOne(jobId);

    const saved = await this.dataSource.transaction(async (tx) => {
      const candidate = await tx.save(
        tx.create(Candidate, {
          jobId,
          name: dto.name.trim(),
          email: dto.email?.trim().toLowerCase() ?? null,
          resumeText: dto.resumeText,
          stage: Stage.APPLIED,
          scoringStatus: ScoringStatus.PENDING,
        }),
      );
      await tx.save(
        tx.create(StageEvent, {
          candidateId: candidate.id,
          fromStage: null,
          toStage: Stage.APPLIED,
          actor: 'user',
          reason: 'Application received',
        }),
      );
      return candidate;
    });

    // Published after commit so the worker can never see a missing row.
    await this.scoring.resumeUploaded(saved.id);
    return saved;
  }

  listForJob(jobId: string, stage?: Stage): Promise<Candidate[]> {
    const qb = this.candidates
      .createQueryBuilder('c')
      .select([
        'c.id', 'c.jobId', 'c.name', 'c.email', 'c.stage', 'c.scoringStatus',
        'c.score', 'c.createdAt', 'c.updatedAt',
      ])
      .where('c.jobId = :jobId', { jobId })
      .orderBy('c.score', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'ASC');
    if (stage) qb.andWhere('c.stage = :stage', { stage });
    return qb.getMany();
  }

  async findOne(id: string): Promise<Candidate> {
    const candidate = await this.candidates.findOne({
      where: { id },
      relations: { events: true },
      order: { events: { createdAt: 'ASC' } },
    });
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
    return candidate;
  }

  /**
   * Manual move by a recruiter. The row lock serialises this against the
   * worker, and the 'user' event tells automation not to override it later.
   */
  async moveStage(id: string, dto: MoveStageDto): Promise<Candidate> {
    await this.dataSource.transaction(async (tx) => {
      const candidate = await tx.findOne(Candidate, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
      if (candidate.stage === dto.stage) {
        throw new BadRequestException(`Candidate is already in ${dto.stage}`);
      }
      const from = candidate.stage;
      candidate.stage = dto.stage;
      await tx.save(candidate);
      await tx.save(
        tx.create(StageEvent, {
          candidateId: id,
          fromStage: from,
          toStage: dto.stage,
          actor: 'user',
          reason: dto.reason ?? 'Moved manually',
        }),
      );
    });
    return this.findOne(id);
  }

  async rescore(id: string): Promise<Candidate> {
    const candidate = await this.candidates.findOne({ where: { id } });
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
    if (candidate.scoringStatus === ScoringStatus.PROCESSING) {
      throw new BadRequestException('Scoring is already in progress');
    }
    await this.candidates.update(id, { scoringStatus: ScoringStatus.PENDING, scoringError: null });
    await this.scoring.rescore(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.candidates.delete(id);
    if (!res.affected) throw new NotFoundException(`Candidate ${id} not found`);
  }
}
