import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Job } from './job.entity';
import type { StageEvent } from './stage-event.entity';
import { ScoringStatus, Stage } from './stage.enum';
import type { Analysis } from '../llm/analysis.schema';

@Entity('candidates')
// Board view: "all candidates for job X in stage Y"
@Index('idx_candidates_job_stage', ['jobId', 'stage'])
// Ranked view: "top candidates for job X by score"
@Index('idx_candidates_job_score', ['jobId', 'score'])
export class Candidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'job_id' })
  jobId: string;

  @ManyToOne('Job', (j: Job) => j.candidates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 320, nullable: true, type: 'varchar' })
  email: string | null;

  @Column('text', { name: 'resume_text' })
  resumeText: string;

  @Column({ type: 'enum', enum: Stage, default: Stage.APPLIED })
  stage: Stage;

  @Column({
    name: 'scoring_status',
    type: 'enum',
    enum: ScoringStatus,
    default: ScoringStatus.PENDING,
  })
  scoringStatus: ScoringStatus;

  /**
   * Bumped on every scoring request. Jobs carry the version they were issued
   * for, and the worker drops results for anything but the current version,
   * so an older, slower run can never overwrite a newer one.
   */
  @Column('int', { name: 'scoring_version', default: 1 })
  scoringVersion: number;

  /**
   * Ownership token for the run currently allowed to write a result. Each
   * claim issues a fresh token; a worker whose token was superseded (e.g. a
   * stalled job that BullMQ handed to another worker) can no longer write.
   */
  @Column('uuid', { name: 'scoring_attempt', nullable: true })
  scoringAttempt: string | null;

  @Column('int', { nullable: true })
  score: number | null;

  /** Which provider produced the score, e.g. "anthropic:claude-haiku-5-5" or "heuristic". */
  @Column({ name: 'scored_by', length: 120, nullable: true, type: 'varchar' })
  scoredBy: string | null;

  /** Structured LLM output: matched/missing skills, reasons, summary. */
  @Column('jsonb', { nullable: true })
  analysis: Analysis | null;

  @Column('text', { name: 'outreach_draft', nullable: true })
  outreachDraft: string | null;

  @Column('text', { name: 'scoring_error', nullable: true })
  scoringError: string | null;

  @OneToMany('StageEvent', (e: StageEvent) => e.candidate)
  events: StageEvent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
