import { Job, Stage, validateThresholds } from '@app/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto, UpdateJobDto } from './jobs.dto';

export interface JobMetrics {
  total: number;
  byStage: Record<Stage, number>;
  averageScore: number | null;
  scoredCount: number;
  failedCount: number;
  /** Mean seconds from application to the first automated stage decision. */
  avgSecondsToScreen: number | null;
}

@Injectable()
export class JobsService {
  constructor(@InjectRepository(Job) private readonly jobs: Repository<Job>) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobs.create(dto);
    this.assertThresholds(job);
    return this.jobs.save(job);
  }

  findAll(): Promise<Job[]> {
    return this.jobs.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.findOne(id);
    Object.assign(job, dto);
    this.assertThresholds(job);
    return this.jobs.save(job);
  }

  async remove(id: string): Promise<void> {
    const res = await this.jobs.delete(id);
    if (!res.affected) throw new NotFoundException(`Job ${id} not found`);
  }

  /** Aggregates computed in SQL so the work scales with the DB, not the API process. */
  async metrics(id: string): Promise<JobMetrics> {
    await this.findOne(id);
    const manager = this.jobs.manager;

    const stageRows: { stage: Stage; count: string }[] = await manager.query(
      `SELECT stage, COUNT(*)::text AS count FROM candidates WHERE job_id = $1 GROUP BY stage`,
      [id],
    );
    const byStage = Object.fromEntries(Object.values(Stage).map((s) => [s, 0])) as Record<
      Stage,
      number
    >;
    let total = 0;
    for (const r of stageRows) {
      byStage[r.stage] = Number(r.count);
      total += Number(r.count);
    }

    const [agg] = await manager.query(
      `SELECT AVG(score)::float AS avg_score,
              COUNT(*) FILTER (WHERE scoring_status = 'SCORED')::int AS scored,
              COUNT(*) FILTER (WHERE scoring_status = 'FAILED')::int AS failed
         FROM candidates WHERE job_id = $1`,
      [id],
    );

    const [timing] = await manager.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_auto.created_at - c.created_at)))::float AS avg_seconds
         FROM candidates c
         JOIN LATERAL (
           SELECT e.created_at FROM stage_events e
            WHERE e.candidate_id = c.id AND e.actor = 'system' AND e.from_stage IS NOT NULL
            ORDER BY e.created_at ASC LIMIT 1
         ) first_auto ON TRUE
        WHERE c.job_id = $1`,
      [id],
    );

    return {
      total,
      byStage,
      averageScore: agg.avg_score === null ? null : Math.round(agg.avg_score * 10) / 10,
      scoredCount: agg.scored,
      failedCount: agg.failed,
      avgSecondsToScreen:
        timing.avg_seconds === null ? null : Math.round(timing.avg_seconds * 10) / 10,
    };
  }

  private assertThresholds(job: Job) {
    const err = validateThresholds({
      advanceThreshold: job.advanceThreshold ?? 80,
      reviewThreshold: job.reviewThreshold ?? 50,
    });
    if (err) throw new BadRequestException(err);
  }
}
