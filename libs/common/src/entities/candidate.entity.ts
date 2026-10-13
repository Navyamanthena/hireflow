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

  @Column('int', { nullable: true })
  score: number | null;

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
