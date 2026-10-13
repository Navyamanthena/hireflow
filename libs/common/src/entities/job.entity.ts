import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Candidate } from './candidate.entity';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column('text')
  description: string;

  /** Score at or above this auto-advances the candidate to PHONE_SCREEN. */
  @Column('int', { name: 'advance_threshold', default: 80 })
  advanceThreshold: number;

  /** Score below this routes the candidate to NEEDS_REVIEW for a human decision. */
  @Column('int', { name: 'review_threshold', default: 50 })
  reviewThreshold: number;

  @OneToMany('Candidate', (c: Candidate) => c.job)
  candidates: Candidate[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
