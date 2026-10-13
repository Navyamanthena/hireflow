import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Candidate } from './candidate.entity';
import { Stage } from './stage.enum';

export type Actor = 'system' | 'user';

/**
 * Append-only audit log of every stage transition. Powers the candidate
 * timeline and the time-to-screen metric.
 */
@Entity('stage_events')
@Index('idx_stage_events_candidate_created', ['candidateId', 'createdAt'])
export class StageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'candidate_id' })
  candidateId: string;

  @ManyToOne('Candidate', (c: Candidate) => c.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column({ name: 'from_stage', type: 'enum', enum: Stage, nullable: true })
  fromStage: Stage | null;

  @Column({ name: 'to_stage', type: 'enum', enum: Stage })
  toStage: Stage;

  @Column({ length: 16 })
  actor: Actor;

  @Column('text', { nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
