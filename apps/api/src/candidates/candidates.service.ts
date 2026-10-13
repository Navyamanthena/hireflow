import {
  Candidate,
  RESUME_RESCORE,
  RESUME_UPLOADED,
  ScoringStatus,
  Stage,
  StageEvent,
} from '@app/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JobsService } from '../jobs/jobs.service';
import { CreateCandidateDto, MoveStageDto } from './candidates.dto';
import { OutboxRelay } from './outbox.relay';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate) private readonly candidates: Repository<Candidate>,
    private readonly dataSource: DataSource,
    private readonly jobs: JobsService,
    private readonly relay: OutboxRelay,
  ) {}

  /**
   * Candidate, audit event and scoring event commit atomically. The relay
   * publishes the event, so a Redis outage or crash can delay scoring but
   * cannot lose it.
   */
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
          scoringVersion: 1,
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
      await OutboxRelay.enqueue(tx, RESUME_UPLOADED, { candidateId: candidate.id, version: 1 });
      return candidate;
    });

    void this.relay.kick(); // fast path; the relay timer is the safety net
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

  /**
   * Atomic claim: the status check and the version bump are one UPDATE, so
   * concurrent rescore clicks produce exactly one new scoring run; the rest
   * get 409. The new version makes any in-flight older run discard its result.
   */
  async rescore(id: string): Promise<Candidate> {
    await this.dataSource.transaction(async (tx) => {
      const [rows] = await tx.query(
        `UPDATE candidates
            SET scoring_version = scoring_version + 1,
                scoring_status = 'PENDING',
                scoring_error = NULL,
                updated_at = now()
          WHERE id = $1 AND scoring_status NOT IN ('PENDING', 'PROCESSING')
        RETURNING scoring_version`,
        [id],
      );
      if (!rows.length) {
        const exists = await tx.exists(Candidate, { where: { id } });
        if (!exists) throw new NotFoundException(`Candidate ${id} not found`);
        throw new ConflictException('This candidate is already being scored');
      }
      await OutboxRelay.enqueue(tx, RESUME_RESCORE, { candidateId: id, version: rows[0].scoring_version });
    });
    void this.relay.kick();
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.candidates.delete(id);
    if (!res.affected) throw new NotFoundException(`Candidate ${id} not found`);
  }
}
