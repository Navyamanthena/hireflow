import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Transactional outbox. Events are written in the SAME transaction as the
 * state change that caused them, so "candidate saved" and "scoring requested"
 * can never disagree. A relay publishes unpublished rows to Redis and retries
 * until it succeeds, so a Redis outage or an API crash delays scoring but
 * never loses it.
 */
@Entity('outbox_events')
// Partial index: the relay only ever scans rows that still need publishing.
@Index('idx_outbox_unpublished', ['createdAt'], { where: '"published_at" IS NULL' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  type: string;

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column('int', { default: 0 })
  attempts: number;

  @Column('text', { name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
